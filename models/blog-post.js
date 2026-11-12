import mongoose from "mongoose";

const blogPostSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 160, trim: true },
  slug: { type: String, required: true, index: true },
  excerpt: { type: String, required: true, maxlength: 300, trim: true },
  content: { type: String, required: true, maxlength: 20000, trim: true },
  imageData: { type: String, default: null, maxlength: 2800000 },
  status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

blogPostSchema.index({ status: 1, publishedAt: -1 });

export const BlogPost = mongoose.models.BlogPost || mongoose.model("BlogPost", blogPostSchema);
