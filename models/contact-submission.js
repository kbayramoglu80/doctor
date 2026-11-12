import mongoose from "mongoose";

const contactSubmissionSchema = new mongoose.Schema({
  fullName: { type: String, required: true, maxlength: 100, trim: true },
  phone: { type: String, required: true, maxlength: 30, trim: true },
  email: { type: String, default: "", maxlength: 254, trim: true, lowercase: true },
  message: { type: String, required: true, maxlength: 2000, trim: true },
  consentedAt: { type: Date, required: true },
  isRead: { type: Boolean, default: false, index: true },
}, { timestamps: true });

export const ContactSubmission = mongoose.models.ContactSubmission
  || mongoose.model("ContactSubmission", contactSubmissionSchema);
