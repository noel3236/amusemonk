import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseUpload } from '@/features/ingest/parse';

const HEADER = 'client_reference_id,bank_account,ifsc_code,inr_amount,transaction_date,beneficiary_name';
const ROW = 'INV-2026-000101,0123456789,HDFC0000044,1500.00,2026-10-28,Asha Rao';

describe('parseUpload', () => {
  it('reads CSV with a BOM and CRLF, normalising headers', async () => {
    const body = '\uFEFF' + HEADER.toUpperCase().replace(/,/g, ' , ') + '\r\n' + ROW + '\r\n';
    const out = await parseUpload(Buffer.from(body), 'a.csv');
    expect(out.headers).toEqual(HEADER.split(','));
    expect(out.rows[0]!.client_reference_id).toBe('INV-2026-000101');
  });

  it('keeps leading zeros and ignores trailing blank rows', async () => {
    const out = await parseUpload(Buffer.from(`${HEADER}\n${ROW}\n,,,,,\n\n`), 'a.csv');
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.bank_account).toBe('0123456789');
  });

  it('rejects other file types', async () => {
    await expect(parseUpload(Buffer.from('x'), 'a.txt')).rejects.toThrow(/unsupported/i);
  });

  it('reads the first XLSX sheet: text accounts, numeric amounts, date cells', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Payouts');
    ws.addRow(HEADER.split(','));
    ws.addRow(['INV-2026-000102', '000987654321', 'ICIC0001234', 250.5, new Date(Date.UTC(2026, 9, 28)), 'Ravi Kumar']);
    const out = await parseUpload(Buffer.from(await wb.xlsx.writeBuffer()), 'a.xlsx');
    expect(out.rows[0]).toMatchObject({ bank_account: '000987654321', inr_amount: '250.5', transaction_date: '2026-10-28' });
  });
});
