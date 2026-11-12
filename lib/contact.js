const MAX_NAME_LENGTH = 100;
const MAX_PHONE_LENGTH = 30;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 2000;

export function validateContactSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Geçerli bir iletişim formu gönderin." };
  }

  const { fullName, phone, email, message, consent } = input;
  if (typeof fullName !== "string" || fullName.trim().length < 2 || fullName.trim().length > MAX_NAME_LENGTH) {
    return { error: `Ad soyad 2-${MAX_NAME_LENGTH} karakter olmalıdır.` };
  }
  if (
    typeof phone !== "string"
    || phone.trim().length > MAX_PHONE_LENGTH
    || !/^[+\d\s().-]+$/.test(phone.trim())
    || (phone.match(/\d/g) || []).length < 7
  ) {
    return { error: "Geçerli bir telefon numarası girin." };
  }
  if (
    email !== undefined
    && (typeof email !== "string" || email.trim().length > MAX_EMAIL_LENGTH
      || (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())))
  ) {
    return { error: "Geçerli bir e-posta adresi girin." };
  }
  if (typeof message !== "string" || !message.trim() || message.trim().length > MAX_MESSAGE_LENGTH) {
    return { error: `Mesaj 1-${MAX_MESSAGE_LENGTH} karakter olmalıdır.` };
  }
  if (consent !== true) {
    return { error: "Formu göndermek için kişisel verilerin işlenmesine onay vermelisiniz." };
  }

  return {
    value: {
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: (email || "").trim().toLowerCase(),
      message: message.trim(),
    },
  };
}
