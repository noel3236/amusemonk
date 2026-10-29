'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/auth/roles';
import { rejectFileByAdmin } from './admin';

export async function rejectFileAction(fileId: string, reason: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role)) return { error: 'Only a super admin can reject files.' };
  if (reason.trim().length < 5) return { error: 'Tell the user why: at least a few words.' };
  const r = await rejectFileByAdmin(fileId, session.user.id, reason.trim());
  if (!r.ok) return { error: r.reason };
  revalidatePath('/admin/files');
  revalidatePath('/files');
  return {};
}
