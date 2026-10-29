import { canSee, notFound, viewer } from '@/features/files/access';
import { getFile } from '@/features/files/server';
import { storage } from '@/lib/storage';

const TYPES: Record<string, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return new Response('Sign in first', { status: 401 });
  const file = await getFile((await params).id);
  if (!file || !canSee(v, file.user_id)) return notFound();

  const bytes = await storage().get(file.s3_key);
  const ext = file.original_filename.split('.').pop()?.toLowerCase() ?? '';
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.original_filename.replace(/[^A-Za-z0-9._-]+/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
