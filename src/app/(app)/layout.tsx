import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/auth/roles';
import { AppShell } from '@/ui';
import { logoutAction } from './actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

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
