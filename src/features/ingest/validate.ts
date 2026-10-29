import type { UploadError } from '@/db/schema';
import { formatInr, parseInrToPaise } from '@/lib/money';
import { COLUMNS, type Column, type CustomKind, type RuleParams } from '@/features/rules/catalog';
import { canonicalContentHash, rowFingerprint } from './fingerprint';
import type { ParsedFile } from './parse';

// Gateway contract for client_reference_id; sent verbatim as the idempotency key.
export const REFERENCE_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const BANK_ACCOUNT_RE = /^\d{9,18}$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,99}$/;

export interface CustomRule {
  key: string;
  name: string;
  kind: CustomKind;
  params: RuleParams<'column_pattern'> | RuleParams<'value_list'>;
}

// The switchable part of the rule set. Locked rules (columns, row_format, duplicate_reference,
// duplicate_payment) are not in here: they always run, whatever the database says.
export interface Ruleset {
  maxFileSize?: RuleParams<'max_file_size'>;
  maxRows?: RuleParams<'max_rows'>;
  amountRange?: RuleParams<'amount_range'>;
  fileTotalMax?: RuleParams<'file_total_max'>;
  dateWindow?: RuleParams<'date_window'>;
  maxRowsPerAccount?: RuleParams<'max_rows_per_account'>;
  duplicateFilename: boolean;
  duplicateFile: boolean;
  duplicateContent: boolean;
  balanceCheck: boolean;
  custom: CustomRule[];
}

export interface ParsedPayout {
  fileRow: number;
  clientReferenceId: string;
  bankAccount: string;
  ifscCode: string;
  beneficiaryName: string;
  amountPaise: bigint;
  transactionDate: string;
  fingerprint: string;
}

export interface ValidationResult {
  errors: UploadError[];
  payouts: ParsedPayout[];
  totalPaise: bigint;
  canonicalHash: string | null;
}

export function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

export function todayIst(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function headerErrors(headers: string[]): UploadError[] {
  const errors: UploadError[] = [];
  const seen = new Map<string, number>();
  for (const h of headers) seen.set(h, (seen.get(h) ?? 0) + 1);
  const e = (column: string, code: string, message: string) =>
    errors.push({ row: 1, column, rule: 'columns', code, message });
  for (const [h, n] of seen) if (n > 1) e(h, 'DUPLICATE_COLUMN', `Column "${h}" appears ${n} times`);
  for (const c of COLUMNS) if (!seen.has(c)) e(c, 'MISSING_COLUMN', `Required column "${c}" is missing`);
  for (const h of seen.keys()) {
    if (!(COLUMNS as readonly string[]).includes(h)) {
      e(h, 'EXTRA_COLUMN', `Unexpected column "${h}" — only ${COLUMNS.join(', ')} are allowed`);
    }
  }
  return errors;
}

function customRuleError(rule: CustomRule, value: string): string | null {
  const p = rule.params;
  if (rule.kind === 'column_pattern') {
    const cp = p as RuleParams<'column_pattern'>;
    const matches = new RegExp(cp.pattern).test(value);
    if (matches === (cp.mode === 'must_match')) return null;
    return cp.message || `${cp.column} "${value}" ${cp.mode === 'must_match' ? 'does not match' : 'matches'} /${cp.pattern}/`;
  }
  const vl = p as RuleParams<'value_list'>;
  const listed = vl.values.some((v) => v.toLowerCase() === value.toLowerCase());
  if (listed === (vl.mode === 'allow')) return null;
  return vl.message || `${vl.column} "${value}" is ${vl.mode === 'allow' ? 'not on the allowed list' : 'blocked'}`;
}

export function validateParsedFile(file: ParsedFile, rules: Ruleset, today: string): ValidationResult {
  const errors: UploadError[] = [];
  const payouts: ParsedPayout[] = [];
  const fail = (): ValidationResult => ({ errors, payouts: [], totalPaise: 0n, canonicalHash: null });

  errors.push(...headerErrors(file.headers));
  if (errors.length) return fail();

  if (file.rows.length === 0) {
    errors.push({ rule: 'columns', code: 'NO_ROWS', message: 'The file has a header but no payout rows' });
    return fail();
  }
  if (rules.maxRows && file.rows.length > rules.maxRows.max_rows) {
    errors.push({
      rule: 'max_rows',
      code: 'TOO_MANY_ROWS',
      message: `File has ${file.rows.length} rows; the limit is ${rules.maxRows.max_rows}`,
    });
    return fail();
  }

  const minPaise = rules.amountRange ? parseInrToPaise(rules.amountRange.min_inr) : null;
  const maxPaise = rules.amountRange ? parseInrToPaise(rules.amountRange.max_inr) : null;
  const refsSeen = new Map<string, number>();
  const fingerprintsSeen = new Map<string, number>();
  const accountCounts = new Map<string, number>();
  let total = 0n;

  file.rows.forEach((rec, idx) => {
    const fileRow = idx + 2; // the header is line 1
    const rowErrors: UploadError[] = [];
    const err = (column: Column | undefined, rule: string, code: string, message: string) =>
      rowErrors.push({ row: fileRow, column, rule, code, message });

    if (COLUMNS.every((c) => (rec[c] ?? '') === '')) {
      errors.push({ row: fileRow, rule: 'row_format', code: 'EMPTY_ROW', message: 'Empty row in the middle of the file' });
      return;
    }

    const values: Record<Column, string> = {
      client_reference_id: (rec.client_reference_id ?? '').trim(),
      bank_account: (rec.bank_account ?? '').trim(),
      ifsc_code: (rec.ifsc_code ?? '').trim().toUpperCase(),
      inr_amount: (rec.inr_amount ?? '').trim(),
      transaction_date: (rec.transaction_date ?? '').trim(),
      beneficiary_name: (rec.beneficiary_name ?? '').trim().replace(/\s+/g, ' '),
    };
    const ref = values.client_reference_id;

    if (!REFERENCE_RE.test(ref)) {
      err('client_reference_id', 'row_format', 'INVALID_REFERENCE', `client_reference_id "${ref}" must be 8–64 characters of A-Z a-z 0-9 _ -`);
    }
    if (!BANK_ACCOUNT_RE.test(values.bank_account)) {
      err('bank_account', 'row_format', 'INVALID_BANK_ACCOUNT', `bank_account "${values.bank_account}" must be 9–18 digits`);
    }
    if (!IFSC_RE.test(values.ifsc_code)) {
      err('ifsc_code', 'row_format', 'INVALID_IFSC', `ifsc_code "${values.ifsc_code}" is not a valid IFSC (e.g. HDFC0000044)`);
    }
    if (!NAME_RE.test(values.beneficiary_name)) {
      err('beneficiary_name', 'row_format', 'INVALID_BENEFICIARY_NAME', `beneficiary_name "${values.beneficiary_name}" must be 2–100 letters, spaces or dots`);
    }

    const amountPaise = parseInrToPaise(values.inr_amount);
    if (amountPaise === null || amountPaise <= 0n) {
      err('inr_amount', 'row_format', 'INVALID_AMOUNT', `inr_amount "${values.inr_amount}" must be a positive number with at most 2 decimals`);
    } else if (minPaise !== null && amountPaise < minPaise) {
      err('inr_amount', 'amount_range', 'AMOUNT_BELOW_MIN', `inr_amount ${values.inr_amount} is below the minimum of ₹${formatInr(minPaise)}`);
    } else if (maxPaise !== null && amountPaise > maxPaise) {
      err('inr_amount', 'amount_range', 'AMOUNT_ABOVE_MAX', `inr_amount ${values.inr_amount} is above the maximum of ₹${formatInr(maxPaise)}`);
    }

    const date = values.transaction_date;
    if (!isRealDate(date)) {
      err('transaction_date', 'row_format', 'INVALID_DATE', `transaction_date "${date}" must be a real date in YYYY-MM-DD`);
    } else if (rules.dateWindow) {
      const age = daysBetween(date, today);
      if (age < 0) err('transaction_date', 'date_window', 'DATE_IN_FUTURE', `transaction_date ${date} is in the future`);
      else if (age > rules.dateWindow.max_age_days) {
        err('transaction_date', 'date_window', 'DATE_TOO_OLD', `transaction_date ${date} is older than ${rules.dateWindow.max_age_days} days`);
      }
    }

    // Checked even when the row has other errors, so the user sees every problem at once.
    if (ref) {
      const first = refsSeen.get(ref.toLowerCase());
      if (first !== undefined) {
        err('client_reference_id', 'duplicate_reference', 'DUPLICATE_REFERENCE_IN_FILE', `client_reference_id "${ref}" is already used on row ${first}`);
      } else refsSeen.set(ref.toLowerCase(), fileRow);
    }

    for (const rule of rules.custom) {
      const message = customRuleError(rule, values[rule.params.column]);
      if (message) err(rule.params.column, rule.key, 'CUSTOM_RULE', message);
    }

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }

    const fingerprint = rowFingerprint({
      bankAccount: values.bank_account,
      ifscCode: values.ifsc_code,
      amountPaise: amountPaise!,
      transactionDate: date,
    });
    const fpFirst = fingerprintsSeen.get(fingerprint);
    if (fpFirst !== undefined) {
      errors.push({
        row: fileRow,
        rule: 'duplicate_payment',
        code: 'DUPLICATE_PAYMENT_IN_FILE',
        message: `Same bank_account, ifsc_code, inr_amount and transaction_date as row ${fpFirst} (different client_reference_id)`,
      });
      return;
    }
    fingerprintsSeen.set(fingerprint, fileRow);

    accountCounts.set(values.bank_account, (accountCounts.get(values.bank_account) ?? 0) + 1);
    total += amountPaise!;
    payouts.push({
      fileRow,
      clientReferenceId: ref,
      bankAccount: values.bank_account,
      ifscCode: values.ifsc_code,
      beneficiaryName: values.beneficiary_name,
      amountPaise: amountPaise!,
      transactionDate: date,
      fingerprint,
    });
  });

  if (rules.maxRowsPerAccount) {
    for (const [account, n] of accountCounts) {
      if (n > rules.maxRowsPerAccount.max) {
        errors.push({
          column: 'bank_account',
          rule: 'max_rows_per_account',
          code: 'ACCOUNT_REPEATED_TOO_OFTEN',
          message: `bank_account ${account} appears ${n} times; the limit per file is ${rules.maxRowsPerAccount.max}`,
        });
      }
    }
  }

  const maxTotal = rules.fileTotalMax ? parseInrToPaise(rules.fileTotalMax.max_inr) : null;
  if (maxTotal !== null && total > maxTotal) {
    errors.push({
      rule: 'file_total_max',
      code: 'FILE_TOTAL_ABOVE_MAX',
      message: `File total ₹${formatInr(total)} exceeds the limit of ₹${formatInr(maxTotal)}`,
    });
  }

  if (errors.length) return fail();
  return { errors, payouts, totalPaise: total, canonicalHash: canonicalContentHash(payouts) };
}
