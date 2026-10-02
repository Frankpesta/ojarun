/**
 * Normalise a Nigerian mobile number to E.164 (+234XXXXXXXXXX). Accepts 0803…, 803…, 234803…, +234 803….
 * Returns null if it isn't a plausible Nigerian mobile number.
 */
export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let national: string;
  if (digits.startsWith("234")) national = digits.slice(3);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits;
  if (!/^[789][01]\d{8}$/.test(national)) return null;
  return `+234${national}`;
}

/** "+2348031234567" → "0803 123 4567" */
export function formatNigerianPhone(e164: string): string {
  const national = e164.replace(/^\+234/, "0");
  return national.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3");
}
