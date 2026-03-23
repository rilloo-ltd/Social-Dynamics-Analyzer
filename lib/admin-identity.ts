const ADMIN_EMAIL_VARIANTS = [
  'sduppleganger@gmail.com',
  'sdupplegnger@gmail.com',
] as const;

export const ALLOWED_ADMIN_EMAIL = ADMIN_EMAIL_VARIANTS[0];
export const ALLOWED_ADMIN_EMAILS = new Set<string>(ADMIN_EMAIL_VARIANTS);

export function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

export function isAllowedAdminEmail(email?: string | null): boolean {
  return ALLOWED_ADMIN_EMAILS.has(normalizeEmail(email));
}
