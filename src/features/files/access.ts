import 'server-only';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/auth/roles';

// Downloads are route handlers, which the (app) layout's login redirect doesn't cover: check here.
export async function viewer(): Promise<{ userId: string; admin: boolean } | null> {
  const session = await auth();
  if (!session?.user) return null;
  return { userId: session.user.id, admin: isSuperAdmin(session.user.role) };
}

export const canSee = (v: { userId: string; admin: boolean }, ownerId: string) => v.admin || v.userId === ownerId;

export const notFound = () => new Response('Not found', { status: 404 });
