export const SUPER_ADMIN = 'super_admin';

export function isSuperAdmin(role: string | undefined): boolean {
  return role === SUPER_ADMIN;
}
