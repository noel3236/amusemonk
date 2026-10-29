import { db } from '@/db';
import { canSee, notFound, viewer } from '@/features/files/access';
import { csvResponse, toCsv } from '@/lib/csv';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return new Response('Sign in first', { status: 401 });
  const attempt = await db()
    .selectFrom('upload_attempts')
    .select(['user_id', 'original_filename', 'errors_json'])
    .where('id', '=', (await params).id)
    .executeTakeFirst();
  if (!attempt || !canSee(v, attempt.user_id)) return notFound();

  const body = toCsv(
    ['row', 'column', 'rule', 'code', 'problem'],
    attempt.errors_json.map((e) => [e.row ?? '', e.column ?? '', e.rule ?? '', e.code, e.message])
  );
  const stem = attempt.original_filename.replace(/\.(csv|xlsx)$/i, '');
  return csvResponse(body, `${stem}-errors.csv`);
}
