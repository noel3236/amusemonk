'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/db';
import { lastBalance } from '@/features/balance/server';
import type { FileReview } from '@/features/files/file-decision';
import { ingestFile, type IngestResult } from './service';

const PREVIEW_ROWS = 100;

export type UploadReview = FileReview & {
  rows: { row: number; reference: string; name: string; account: string; ifsc: string; amountPaise: string }[];
};

export type UploadState = { result?: IngestResult; review?: UploadReview; filename?: string; error?: string };

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
  if (result.outcome !== 'ACCEPTED') return { result, filename: file.name };

  const [f, rows, balance] = await Promise.all([
    db().selectFrom('payout_files').select('warnings_json').where('id', '=', result.fileId).executeTakeFirstOrThrow(),
    db()
      .selectFrom('payouts')
      .select(['file_row', 'client_reference_id', 'beneficiary_name', 'bank_account', 'ifsc_code', 'amount_paise'])
      .where('file_id', '=', result.fileId)
      .orderBy('file_row')
      .limit(PREVIEW_ROWS)
      .execute(),
    lastBalance(session.user.id),
  ]);
  return {
    result,
    filename: file.name,
    review: {
      fileId: result.fileId,
      filename: file.name,
      rowCount: result.rowCount,
      totalPaise: result.totalPaise,
      balance: balance?.balance_paise ? { paise: balance.balance_paise, asOf: balance.fetched_at?.toISOString() ?? null } : null,
      warnings: f.warnings_json,
      rows: rows.map((r) => ({
        row: r.file_row,
        reference: r.client_reference_id,
        name: r.beneficiary_name,
        account: r.bank_account,
        ifsc: r.ifsc_code,
        amountPaise: r.amount_paise,
      })),
    },
  };
}
