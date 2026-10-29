import { db } from '@/db';

export async function listRejectedUploads(userId: string, limit = 50) {
  return db()
    .selectFrom('upload_attempts')
    .select(['id', 'original_filename', 'size_bytes', 'created_at', 'errors_json'])
    .where('user_id', '=', userId)
    .where('outcome', '=', 'REJECTED')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();
}
