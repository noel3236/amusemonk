import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { FileDetail } from '@/features/files/file-detail';
import { getFile } from '@/features/files/server';

export const metadata: Metadata = { title: 'File' };

export default async function FilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const file = await getFile(id);
  if (!file || file.user_id !== session.user.id) notFound();
  return <FileDetail file={file} sp={sp} mode="owner" />;
}
