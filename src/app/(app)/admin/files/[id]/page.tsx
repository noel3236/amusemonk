import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FileDetail } from '@/features/files/file-detail';
import { getFile } from '@/features/files/server';

export const metadata: Metadata = { title: 'File' };

// Read-only for admins (the admin layout already enforces super_admin): no Confirm Payment, no Cancel.
export default async function AdminFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const file = await getFile(id);
  if (!file) notFound();
  return <FileDetail file={file} sp={sp} mode="admin" />;
}
