/**
 * Contact-detail helpers: normalisation, masking and hand-off deep links.
 *
 * Pure functions, no network, no secrets — safe to unit test and safe to reason
 * about. Masking matters: the audit log must record WHERE a message went
 * without storing the full phone number or email address.
 */

/** Strip everything that is not a digit. "+1 (555) 0100" -> "15550100" */
export function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone.trim());
}

/** "+15550103" -> "+1555***03" ; keeps country prefix and last 2 digits. */
export function maskPhone(phone: string): string {
  const digits = normalisePhone(phone);
  if (digits.length < 5) return "***";
  const head = digits.slice(0, 4);
  const tail = digits.slice(-2);
  return `+${head}${"*".repeat(Math.max(digits.length - 6, 1))}${tail}`;
}

/** "demo-four@example.com" -> "d***r@example.com" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  if (local.length <= 2) return `${local[0] ?? "*"}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function maskDestination(channel: "whatsapp" | "email", destination: string): string {
  return channel === "whatsapp" ? maskPhone(destination) : maskEmail(destination);
}

/**
 * WhatsApp click-to-chat deep link.
 *
 * This is the zero-configuration delivery path: it does not send anything from
 * this server. It opens WhatsApp on the staff member's own device with the
 * draft pre-filled, and they press send. No API key, no provider account.
 * https://faq.whatsapp.com/5913398998672934
 */
export function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${normalisePhone(phone)}?text=${encodeURIComponent(message)}`;
}

/** mailto: hand-off link — opens the staff member's own mail client. */
export function buildMailtoLink(email: string, subject: string, body: string): string {
  const params = new URLSearchParams({ subject, body });
  // URLSearchParams encodes spaces as "+", which mailto clients render literally.
  return `mailto:${email}?${params.toString().replace(/\+/g, "%20")}`;
}

export function buildEmailSubject(plan: string, date: string): string {
  return `Weather update for your ${plan} booking on ${date}`;
}
