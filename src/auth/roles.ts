// Gatekeeper's role name for the people who run the admin panel.
export const SUPER_ADMIN = 'super_admin';

export function isSuperAdmin(role: string | undefined): boolean {
  return role === SUPER_ADMIN;
}
