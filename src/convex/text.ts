/**
 * Server-side text field guards for SikaFlow.
 *
 * Every free-text field that reaches the database goes through `bounded`:
 * trimmed, empty→undefined, and hard-capped so a pasted novel can never bloat
 * a document or a print sheet.
 */

export function bounded(
  value: string | null | undefined,
  maxLength: number,
  label: string,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) {
    throw new Error(`${label} is too long (max ${maxLength} characters).`);
  }
  return trimmed;
}

/** Common caps, kept in one place so UI hints can mirror them. */
export const TEXT_LIMITS = {
  customerNotes: 1000,
  company: 100,
  contact: 20,
  email: 120,
  address: 200,
  productDescription: 500,
  category: 60,
  unit: 20,
  lineDescription: 500,
  documentNotes: 1000,
  documentTerms: 2000,
  profileDescription: 300,
  taxNumber: 40,
} as const;
