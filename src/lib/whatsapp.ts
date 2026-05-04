export function waLink(phone: string, text?: string): string {
  const cleaned = phone.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  const base = `https://wa.me/${cleaned}`;
  if (!text || !text.trim()) return base;
  return `${base}?text=${encodeURIComponent(text.trim())}`;
}

export function isValidWaPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}
