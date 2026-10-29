import { COLUMNS } from '@/features/rules/catalog';
import { todayIst } from '@/features/ingest/validate';

export function GET() {
  const today = todayIst();
  const body = [
    COLUMNS.join(','),
    `INV-2026-000101,0123456789,HDFC0000044,1500.00,${today},Asha Rao`,
    `INV-2026-000102,9876543210,ICIC0001234,2750.50,${today},Ravi Kumar`,
  ].join('\n');
  return new Response(body + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="amusemonk-sample.csv"',
    },
  });
}
