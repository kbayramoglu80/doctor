import test from "node:test";
import assert from "node:assert/strict";
import { validateContactSubmission } from "../lib/contact.js";

test("validateContactSubmission accepts and trims a consented message", () => {
  const result = validateContactSubmission({
    fullName: "  Ayşe Yılmaz ",
    phone: "  +90 506 291 80 49 ",
    email: "  AYSE@example.com ",
    message: "  Bilgi almak istiyorum. ",
    consent: true,
  });

  assert.deepEqual(result.value, {
    fullName: "Ayşe Yılmaz",
    phone: "+90 506 291 80 49",
    email: "ayse@example.com",
    message: "Bilgi almak istiyorum.",
  });
});

test("validateContactSubmission rejects missing consent and invalid contact details", () => {
  const base = {
    fullName: "Ayşe Yılmaz",
    phone: "0506 291 80 49",
    email: "",
    message: "Bilgi almak istiyorum.",
  };

  assert.match(validateContactSubmission({ ...base, consent: false }).error, /onay/);
  assert.match(validateContactSubmission({ ...base, phone: "abc", consent: true }).error, /telefon/);
  assert.match(validateContactSubmission({ ...base, email: "not-an-email", consent: true }).error, /e-posta/);
  assert.match(validateContactSubmission({ ...base, message: "", consent: true }).error, /Mesaj/);
});
