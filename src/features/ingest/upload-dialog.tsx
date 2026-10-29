'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileDecision, useFileDecision } from '@/features/files/file-decision';
import { uploadFileAction, type UploadReview, type UploadState } from './actions';
import {
  Badge,
  Button,
  CircleX,
  Dialog,
  DialogBar,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTrigger,
  Download,
  ErrorBanner,
  FileSpreadsheet,
  Link2,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Upload,
  cn,
} from '@/ui';

function RowsPreview({ review }: { review: UploadReview }) {
  return (
    <>
      <div className="bg-surface overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 text-right">Row</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Beneficiary</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {review.rows.map((r) => (
              <TableRow key={r.row}>
                <TableCell className="text-muted-foreground tabular text-right">{r.row}</TableCell>
                <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                <TableCell>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-muted-foreground font-mono text-xs">
                    {r.account} · {r.ifsc}
                  </div>
                </TableCell>
                <TableCell className="tabular text-right font-semibold">{r.amount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {review.rowCount > review.rows.length && (
        <p className="text-muted-foreground text-xs">
          Showing the first {review.rows.length} of {review.rowCount} rows.{' '}
          <Link href={`/files/${review.fileId}`} target="_blank" className="text-primary font-semibold hover:underline">
            Open the file page
          </Link>{' '}
          to see and search all of them.
        </p>
      )}
    </>
  );
}

// Closing at any step is safe: an accepted file just waits in the list for confirmation.
export function UploadDialog({ ruleNames, hasKey }: { ruleNames: Record<string, string>; hasKey: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, uploading] = useActionState<UploadState, FormData>(uploadFileAction, {});
  const [shown, setShown] = useState<UploadState>({});
  const [chosen, setChosen] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const d = useFileDecision();
  const input = useRef<HTMLInputElement>(null);
  const busy = uploading || d.pending;

  // A fresh action result replaces what's on screen; "Choose Another File" clears it without a round trip.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    setShown(state);
  }

  const reset = () => {
    setShown({});
    setChosen(null);
    d.reset();
    if (input.current) input.current.value = '';
  };

  const close = () => {
    setOpen(false);
    reset();
    router.refresh();
  };

  const pick = (files: FileList | null) => {
    const f = files?.[0] ?? null;
    if (f && !/\.(csv|xlsx)$/i.test(f.name)) {
      setChosen(null);
      if (input.current) input.current.value = '';
      setShown({ error: 'Only .csv and .xlsx files can be uploaded.', filename: f.name });
      return;
    }
    setShown({});
    setChosen(f);
    if (f && input.current && input.current.files !== files) {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.current.files = dt.files;
    }
  };

  const review = shown.review;
  const rejected = shown.result?.outcome === 'REJECTED' ? shown.result : null;
  const title = review ? d.title : rejected ? 'File not accepted' : 'Upload Payout File';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (o) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Upload />
          Upload File
        </Button>
      </DialogTrigger>
      <DialogContent pinned className="max-w-4xl">
        <DialogHeader
          icon={<FileSpreadsheet />}
          title={title}
          description={shown.filename ?? 'CSV or XLSX · checked against every upload rule before anything is stored'}
          aside={review && !d.done && <Badge tone="warn">Waiting for confirmation</Badge>}
          closeDisabled={busy}
        />

        {review ? (
          <FileDecision d={d} review={review} onClose={close} fileHref={`/files/${review.fileId}`}>
            <RowsPreview review={review} />
          </FileDecision>
        ) : (
          <>
            <DialogBody>
              {!hasKey ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Link2 className="text-muted-foreground size-6" />
                  <p className="font-bold">Connect your API key first</p>
                  <p className="text-muted-foreground max-w-sm text-sm">
                    Payouts are sent from your own gateway account, so uploads open once your API key is connected.
                  </p>
                  <Button asChild>
                    <Link href="/profile">
                      <Link2 />
                      Connect API Key
                    </Link>
                  </Button>
                </div>
              ) : rejected ? (
                <>
                  <div role="alert" className="bg-bad-soft text-bad flex items-start gap-3 rounded-lg px-4 py-3">
                    <CircleX className="mt-0.5 size-5 shrink-0" />
                    <span className="text-foreground text-sm">
                      Fix the <span className="tabular font-semibold">{rejected.errorCount}</span>{' '}
                      {rejected.errorCount === 1 ? 'problem' : 'problems'} below and upload the whole file again. Nothing from it was stored or sent.
                    </span>
                  </div>
                  <div className="bg-surface overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16 text-right">Row</TableHead>
                          <TableHead>Column</TableHead>
                          <TableHead>Rule</TableHead>
                          <TableHead>Problem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rejected.errors.map((e, i) => (
                          <TableRow key={i}>
                            <TableCell className="tabular text-right">{e.row ?? '—'}</TableCell>
                            <TableCell className="font-mono text-xs">{e.column ?? '—'}</TableCell>
                            <TableCell>{e.rule ? <Badge tone="bad">{ruleNames[e.rule] ?? e.rule}</Badge> : <Badge>System</Badge>}</TableCell>
                            <TableCell className="whitespace-normal">{e.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {rejected.errorCount > rejected.errors.length && (
                    <p className="text-muted-foreground text-xs">
                      Showing the first {rejected.errors.length} of {rejected.errorCount} problems.
                    </p>
                  )}
                </>
              ) : (
                <form id="upload-form" action={action} className="flex flex-col gap-3">
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
                      'bg-surface flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors',
                      dragging ? 'border-primary bg-primary/5' : 'border-field hover:border-primary/60'
                    )}
                  >
                    <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                      <Upload className="size-5" />
                    </span>
                    <span className="text-sm font-bold">{chosen ? chosen.name : 'Drop a payout file here, or click to choose'}</span>
                    <span className="text-muted-foreground max-w-md text-xs">
                      {chosen
                        ? `${(chosen.size / 1024).toFixed(1)} KB · ready to check`
                        : 'Columns: client_reference_id, bank_account, ifsc_code, inr_amount, transaction_date, beneficiary_name'}
                    </span>
                    <input ref={input} type="file" name="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => pick(e.target.files)} />
                  </label>
                  {shown.error && <ErrorBanner>{shown.error}</ErrorBanner>}
                </form>
              )}
            </DialogBody>
            {hasKey && (
              <DialogBar>
                {rejected ? (
                  <Button className="ml-auto" onClick={reset}>
                    <Upload />
                    Choose Another File
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="ghost">
                      <a href="/files/sample.csv" download>
                        <Download />
                        Sample CSV
                      </a>
                    </Button>
                    <Button type="submit" form="upload-form" className="ml-auto" disabled={uploading}>
                      <Upload />
                      {uploading ? 'Checking file…' : 'Check and Upload'}
                    </Button>
                  </>
                )}
              </DialogBar>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
