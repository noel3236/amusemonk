'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import { formatInr } from '@/lib/money';
import { uploadFileAction, type UploadState } from './actions';
import {
  ArrowRight,
  Badge,
  Button,
  Card,
  CircleCheck,
  CircleX,
  Download,
  ErrorBanner,
  FileSpreadsheet,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Upload,
  cn,
} from '@/ui';

export function UploadCard({ ruleNames }: { ruleNames: Record<string, string> }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadFileAction, {});
  const [chosen, setChosen] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = (files: FileList | null) => {
    const f = files?.[0] ?? null;
    setChosen(f);
    if (f && input.current && input.current.files !== files) {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.current.files = dt.files;
    }
  };

  const result = state.result;

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-3">
        <form action={action} className="grid items-center gap-3 lg:grid-cols-[1fr_auto]">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files);
            }}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-md border-2 border-dashed px-4 py-3 transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-field hover:border-primary/60 hover:bg-hover/40'
            )}
          >
            <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
              <FileSpreadsheet className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-bold">{chosen ? chosen.name : 'Drop a payout file here, or click to choose'}</span>
              <span className="text-muted-foreground text-xs">
                {chosen
                  ? `${(chosen.size / 1024).toFixed(1)} KB · checked against every upload rule before anything is stored`
                  : 'CSV or XLSX with client_reference_id, bank_account, ifsc_code, inr_amount, transaction_date, beneficiary_name'}
              </span>
            </span>
            <input
              ref={input}
              type="file"
              name="file"
              accept=".csv,.xlsx"
              className="sr-only"
              onChange={(e) => pick(e.target.files)}
            />
          </label>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <a href="/files/sample.csv" download>
                <Download />
                Sample CSV
              </a>
            </Button>
            <Button type="submit" disabled={pending}>
              <Upload />
              {pending ? 'Checking file…' : 'Check and Upload'}
            </Button>
          </div>
        </form>
      </Card>

      {state.error && <ErrorBanner>{state.error}</ErrorBanner>}

      {result?.outcome === 'ACCEPTED' && (
        <div role="status" className="bg-ok-soft text-ok flex flex-wrap items-center gap-3 rounded-lg px-4 py-3">
          <CircleCheck className="size-5 shrink-0" />
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="font-bold">{state.filename} accepted</span>
            <span className="text-foreground text-sm">
              <span className="tabular font-semibold">{result.rowCount}</span> payouts totalling{' '}
              <span className="tabular font-semibold">₹{formatInr(result.totalPaise)}</span> are waiting for you
              to confirm payment. Nothing has been sent to the gateway yet.
            </span>
          </div>
          <Button asChild>
            <Link href={`/files/${result.fileId}`}>
              Review and Confirm
              <ArrowRight />
            </Link>
          </Button>
        </div>
      )}

      {result?.outcome === 'REJECTED' && (
        <section className="flex flex-col gap-3">
          <div role="alert" className="bg-bad-soft text-bad flex items-start gap-3 rounded-lg px-4 py-3">
            <CircleX className="mt-0.5 size-5 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">{state.filename} was not accepted</span>
              <span className="text-foreground text-sm">
                Fix the <span className="tabular font-semibold">{result.errorCount}</span>{' '}
                {result.errorCount === 1 ? 'problem' : 'problems'} below and upload the whole file again. Nothing
                from it was stored or sent.
              </span>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 text-right">Row</TableHead>
                <TableHead>Column</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Problem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.errors.map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="tabular text-right">{e.row ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{e.column ?? '—'}</TableCell>
                  <TableCell>
                    {e.rule ? <Badge tone="bad">{ruleNames[e.rule] ?? e.rule}</Badge> : <Badge>System</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-normal">{e.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result.errorCount > result.errors.length && (
            <p className="text-muted-foreground text-sm">
              Showing the first {result.errors.length} of {result.errorCount} problems.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
