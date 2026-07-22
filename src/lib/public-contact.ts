const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "");

export const whatsappUrl = whatsappNumber
  ? `https://wa.me/${whatsappNumber}?text=Hello%20Baebe%20Boo%2C%20I%20would%20like%20some%20help.`
  : "/stores";
