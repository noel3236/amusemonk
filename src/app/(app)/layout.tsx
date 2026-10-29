import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/auth/roles';
import { userExists } from '@/db/users';
import { AppShell } from '@/ui';
import { logoutAction } from './actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // A sign-in can outlive its user row (a reset database): sign in again instead of failing every write.
  if (!session?.user || !(await userExists(session.user.id))) redirect('/login');

  return (
    <AppShell
      user={{ email: session.user.email ?? null }}
      isAdmin={isSuperAdmin(session.user.role)}
      signOutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
