/**
 * Client-side mirror of the server's password policy (middleware/security.ts validatePassword), so
 * the form can say what is wrong before a round trip. The server stays the authority — it also
 * rejects breached passwords — and its message is shown whenever it refuses one.
 */
export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_POLICY_HINT =
  `At least ${MIN_PASSWORD_LENGTH} characters. Avoid common passwords, repeated characters (aaaa) and sequences like 123456 or qwerty.`;

/** The first problem with a new password (and its confirmation), or null when it can be submitted. */
export function newPasswordProblem(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next.length > 200) return 'Password is too long (max 200 characters).';
  if (confirm !== next) return 'Passwords do not match.';
  return null;
}

/** The first problem with the whole change-password form, or null when it can be submitted. */
export function changePasswordProblem(current: string, next: string, confirm: string): string | null {
  if (!current) return 'Enter your current password.';
  const p = newPasswordProblem(next, confirm);
  if (p) return p;
  if (next === current) return 'Your new password must be different from the current one.';
  return null;
}
