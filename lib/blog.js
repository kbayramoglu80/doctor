const MAX_TITLE_LENGTH = 160;
const MAX_EXCERPT_LENGTH = 300;
const MAX_CONTENT_LENGTH = 20000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_DATA_LENGTH = 2800000;

function validateImageData(imageData) {
  if (imageData === undefined || imageData === null || imageData === "") {
    return { value: null };
  }
  if (typeof imageData !== "string" || imageData.length > MAX_IMAGE_DATA_LENGTH) {
    return { error: "Görsel en fazla 2 MB olmalıdır." };
  }

  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageData);
  if (!match) return { error: "Görsel JPEG, PNG veya WebP biçiminde olmalıdır." };

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== match[2]) {
    return { error: "Görsel en fazla 2 MB olmalıdır." };
  }

  const isJpeg = match[1] === "jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = match[1] === "png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = match[1] === "webp"
    && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) {
    return { error: "Görsel içeriği seçilen dosya biçimiyle uyuşmuyor." };
  }

  return { value: imageData };
}

export function slugifyTitle(title) {
  const turkishChars = { ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };
  return title
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, character => turkishChars[character])
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100)
    .replace(/-$/g, "");
}

export function validatePost(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Geçerli bir yazı bilgisi gönderin." };
  }

  const { title, excerpt, content, status, imageData } = input;
  if (typeof title !== "string" || !title.trim() || title.trim().length > MAX_TITLE_LENGTH) {
    return { error: `Başlık 1-${MAX_TITLE_LENGTH} karakter olmalıdır.` };
  }
  if (typeof excerpt !== "string" || !excerpt.trim() || excerpt.trim().length > MAX_EXCERPT_LENGTH) {
    return { error: `Özet 1-${MAX_EXCERPT_LENGTH} karakter olmalıdır.` };
  }
  if (typeof content !== "string" || !content.trim() || content.trim().length > MAX_CONTENT_LENGTH) {
    return { error: `İçerik 1-${MAX_CONTENT_LENGTH} karakter olmalıdır.` };
  }
  if (status !== "draft" && status !== "published") {
    return { error: "Yazı durumu taslak veya yayımlanmış olmalıdır." };
  }
  const image = validateImageData(imageData);
  if (image.error) return image;

  return {
    value: {
      title: title.trim(),
      slug: slugifyTitle(title.trim()),
      excerpt: excerpt.trim(),
      content: content.trim(),
      status,
      imageData: image.value,
    },
  };
}
