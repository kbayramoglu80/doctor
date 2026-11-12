import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import connectMongo from "connect-mongo";
import dotenv from "dotenv";
import express from "express";
import { rateLimit } from "express-rate-limit";
import session from "express-session";
import helmet from "helmet";
import mongoose from "mongoose";
import { Admin } from "./models/admin.js";
import { BlogPost } from "./models/blog-post.js";
import { ContactSubmission } from "./models/contact-submission.js";
import { validatePost } from "./lib/blog.js";
import { validateContactSubmission } from "./lib/contact.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_COOKIE = "doctor_site_session";
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function requireEnvironment() {
  const missing = ["MONGODB_URI", "SESSION_SECRET"].filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Eksik ortam değişkenleri: ${missing.join(", ")}. .env.example dosyasını .env olarak kopyalayıp doldurun.`);
  }
  if (process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET en az 32 karakter olmalıdır.");
  }
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(express.json({ limit: "3mb" }));
  app.use(session({
    name: SESSION_COOKIE,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: connectMongo.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: "sessions",
      ttl: 60 * 60 * 8,
    }),
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }));

  app.get("/health", (req, res) => {
    res.json({ status: mongoose.connection.readyState === 1 ? "ok" : "connecting" });
  });

  app.get("/api/csrf", (req, res) => {
    if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString("hex");
    res.set("Cache-Control", "no-store").json({ csrfToken: req.session.csrfToken });
  });

  app.get("/api/posts", asyncRoute(async (req, res) => {
    const posts = await BlogPost.find({ status: "published" })
      .sort({ publishedAt: -1 })
      .select("title slug excerpt content imageData publishedAt")
      .lean();
    res.set("Cache-Control", "no-store").json(posts);
  }));

  const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Çok fazla form gönderildi. Lütfen daha sonra tekrar deneyin." },
  });

  app.post("/api/contact", contactLimiter, verifyCsrf, asyncRoute(async (req, res) => {
    const parsed = validateContactSubmission(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    await ContactSubmission.create({
      ...parsed.value,
      consentedAt: new Date(),
    });
    res.status(201).json({ message: "Mesajınız iletildi. Teşekkür ederiz." });
  }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Çok fazla giriş denemesi. Lütfen daha sonra tekrar deneyin." },
  });

  function verifyCsrf(req, res, next) {
    const token = req.get("x-csrf-token");
    const expected = req.session.csrfToken;
    if (typeof token !== "string" || typeof expected !== "string") {
      return res.status(403).json({ error: "Oturum doğrulanamadı. Sayfayı yenileyip tekrar deneyin." });
    }
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    if (tokenBuffer.length !== expectedBuffer.length || !timingSafeEqual(tokenBuffer, expectedBuffer)) {
      return res.status(403).json({ error: "Oturum doğrulanamadı. Sayfayı yenileyip tekrar deneyin." });
    }
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.session.adminId) return res.status(401).json({ error: "Yönetici girişi gerekli." });
    next();
  }

  app.post("/api/admin/login", loginLimiter, verifyCsrf, asyncRoute(async (req, res, next) => {
    const { password } = req.body ?? {};
    const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
    if (!username || typeof password !== "string" || password.length > 200) {
      return res.status(400).json({ error: "Parola hatalı." });
    }

    const admin = await Admin.findOne({ username });
    const matches = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
    if (!matches) return res.status(401).json({ error: "Parola hatalı." });

    req.session.regenerate(error => {
      if (error) return next(error);
      req.session.adminId = admin.id;
      req.session.csrfToken = randomBytes(32).toString("hex");
      req.session.save(saveError => {
        if (saveError) return next(saveError);
        res.set("Cache-Control", "no-store").json({ authenticated: true, csrfToken: req.session.csrfToken });
      });
    });
  }));

  app.get("/api/admin/session", (req, res) => {
    res.set("Cache-Control", "no-store").json({ authenticated: Boolean(req.session.adminId) });
  });

  app.post("/api/admin/logout", verifyCsrf, requireAdmin, (req, res, next) => {
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie(SESSION_COOKIE, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
      });
      res.status(204).end();
    });
  });

  app.get("/api/admin/posts", requireAdmin, asyncRoute(async (req, res) => {
    const posts = await BlogPost.find().sort({ updatedAt: -1 }).lean();
    res.set("Cache-Control", "no-store").json(posts);
  }));

  app.post("/api/admin/posts", verifyCsrf, requireAdmin, asyncRoute(async (req, res) => {
    const parsed = validatePost(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const now = new Date();
    const post = await BlogPost.create({
      ...parsed.value,
      publishedAt: parsed.value.status === "published" ? now : null,
    });
    res.status(201).json(post);
  }));

  app.put("/api/admin/posts/:id", verifyCsrf, requireAdmin, asyncRoute(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Yazı kimliği geçersiz." });
    const parsed = validatePost(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Yazı bulunamadı." });

    const wasPublished = post.status === "published";
    post.title = parsed.value.title;
    post.slug = parsed.value.slug;
    post.excerpt = parsed.value.excerpt;
    post.content = parsed.value.content;
    post.status = parsed.value.status;
    if (post.status === "draft") post.publishedAt = null;
    else if (!wasPublished || !post.publishedAt) post.publishedAt = new Date();
    await post.save();
    res.json(post);
  }));

  app.delete("/api/admin/posts/:id", verifyCsrf, requireAdmin, asyncRoute(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Yazı kimliği geçersiz." });
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ error: "Yazı bulunamadı." });
    res.status(204).end();
  }));

  app.get("/api/admin/contact-submissions", requireAdmin, asyncRoute(async (req, res) => {
    const submissions = await ContactSubmission.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .select("fullName phone email message isRead createdAt")
      .lean();
    res.set("Cache-Control", "no-store").json(submissions);
  }));

  app.patch("/api/admin/contact-submissions/:id", verifyCsrf, requireAdmin, asyncRoute(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Form kaydı kimliği geçersiz." });
    if (typeof req.body?.isRead !== "boolean") return res.status(400).json({ error: "Okunma durumu geçersiz." });
    const submission = await ContactSubmission.findByIdAndUpdate(
      req.params.id,
      { $set: { isRead: req.body.isRead } },
      { new: true, runValidators: true },
    ).select("isRead").lean();
    if (!submission) return res.status(404).json({ error: "Form kaydı bulunamadı." });
    res.json({ isRead: submission.isRead });
  }));

  app.delete("/api/admin/contact-submissions/:id", verifyCsrf, requireAdmin, asyncRoute(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Form kaydı kimliği geçersiz." });
    const submission = await ContactSubmission.findByIdAndDelete(req.params.id);
    if (!submission) return res.status(404).json({ error: "Form kaydı bulunamadı." });
    res.status(204).end();
  }));

  app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
  app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
  app.get("/fonts.css", (req, res) => res.sendFile(path.join(__dirname, "fonts.css")));
  app.get("/lenis.min.js", (req, res) => res.sendFile(path.join(__dirname, "lenis.min.js")));
  app.get("/public/admin.js", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.js")));
  app.use("/fonts", express.static(path.join(__dirname, "fonts"), { dotfiles: "deny", index: false }));
  app.use("/galeri", express.static(path.join(__dirname, "galeri"), { dotfiles: "deny", index: false }));
  const publicAssets = new Set([
    "image.png",
    "WhatsApp Image 2026-09-15 at 16.21.43.jpeg",
    "WhatsApp Image 2026-09-15 at 16.21.43-Photoroom.png",
    "o-n-c-apraz-bag-yaralanmasi-nedenleri-belirtileri-ve-tedavisi.webp",
    "meniscal-tear-mri.webp",
    "images.jpg",
    "egemen-turhan-diz-kapag\u{306}i-cikmasi-img-4.jpg",
    "Omuz-kas-y\u{131}rt\u{131}\u{11f}\u{131}-1.jpg",
    "omuz-cikigi-1024x576.webp",
    "prosthesis-revision.png",
    "knee-osteoarthritis.jpg",
    "knee-replacement.jpg",
    "hip-replacement.jpg",
    "hip-osteoarthritis.jpg",
    "ganz-pao.jpg",
    "stem-cells.jpg",
    "pediatric-hip-dysplasia.jpg",
    "clubfoot-openstax.jpg",
    "hip-arthroscopy.png",
  ]);
  app.get("/:asset", (req, res, next) => {
    if (!publicAssets.has(req.params.asset)) return next();
    res.sendFile(path.join(__dirname, req.params.asset));
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "API uç noktası bulunamadı." }));
  app.use((err, req, res, next) => {
    console.error("İstek işlenirken hata oluştu:", err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: "Sunucu isteği işlerken bir hata oluştu." });
  });
  return app;
}

async function ensureInitialAdmin() {
  const existingAdmin = await Admin.exists();
  if (existingAdmin) return;
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
    throw new Error("İlk yönetici için ADMIN_USERNAME ve en az 8 karakterli ADMIN_PASSWORD tanımlanmalıdır.");
  }
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await Admin.create({ username: ADMIN_USERNAME.trim().toLowerCase(), passwordHash });
  console.log("İlk yönetici hesabı güvenli biçimde oluşturuldu.");
}

async function start() {
  requireEnvironment();
  await mongoose.connect(process.env.MONGODB_URI);
  await ensureInitialAdmin();
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`Site http://localhost:${port} adresinde çalışıyor.`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch(error => {
    console.error("Sunucu başlatılamadı:", error.message);
    process.exitCode = 1;
  });
}
