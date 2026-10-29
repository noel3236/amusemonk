import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/auth/roles';
import { AdminTabs } from '@/ui';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!isSuperAdmin(session?.user.role)) notFound();

  return (
    <div className="flex flex-col gap-4">
      <AdminTabs />
      {children}
    </div>
  );
}
