import { createHash } from 'node:crypto';

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

// D1: trim, strip any path, lower-case, collapse internal whitespace.
export function normalizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface FingerprintInput {
  bankAccount: string;
  ifscCode: string;
  amountPaise: bigint;
  transactionDate: string; // YYYY-MM-DD
}

// Identity of a *payment*, independent of its reference (duplicate_payment rule).
export function rowFingerprint(r: FingerprintInput): string {
  return sha256Hex(`${r.bankAccount.trim()}|${r.ifscCode.trim().toUpperCase()}|${r.amountPaise.toString()}|${r.transactionDate}`);
}

export interface CanonicalRow extends FingerprintInput {
  clientReferenceId: string;
  beneficiaryName: string;
}

// Hash of the *meaning* of a file (duplicate_content rule): sorted canonical rows, so formatting, BOM, line
// endings, column order and row order don't matter.
export function canonicalContentHash(rows: CanonicalRow[]): string {
  const lines = rows
    .map(
      (r) =>
        `${r.clientReferenceId.trim()}|${r.bankAccount.trim()}|${r.ifscCode.trim().toUpperCase()}|${r.amountPaise.toString()}|${r.transactionDate}|${r.beneficiaryName.trim().toUpperCase().replace(/\s+/g, ' ')}`,
    )
    .sort();
  return sha256Hex(lines.join('\n'));
}
