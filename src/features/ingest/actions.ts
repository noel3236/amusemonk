'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { ingestFile, type IngestResult } from './service';

export type UploadState = { result?: IngestResult; filename?: string; error?: string };

export async function uploadFileAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const session = await auth();
  if (!session?.user) return { error: 'Your session has expired. Sign in again.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a CSV or XLSX file to upload.' };
  if (!/\.(csv|xlsx)$/i.test(file.name)) return { error: 'Only .csv and .xlsx files can be uploaded.', filename: file.name };

  const result = await ingestFile({
    userId: session.user.id,
    filename: file.name,
    buffer: Buffer.from(await file.arrayBuffer()),
  });
  revalidatePath('/files');
  revalidatePath('/dashboard');
  return { result, filename: file.name };
}
