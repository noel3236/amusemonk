import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import path from 'node:path';

export interface ParsedFile {
  headers: string[];
  // Raw string values keyed by the normalised header (trimmed, lower-cased).
  rows: Record<string, string>[];
}

export class ParseError extends Error {
  constructor(
    message: string,
    readonly code: string = 'PARSE_ERROR'
  ) {
    super(message);
  }
}

export function normalizeHeader(h: string): string {
  return h.replace(/^﻿/, '').trim().toLowerCase();
}

function isBlankRow(values: string[]): boolean {
  return values.every((v) => v.trim() === '');
}

// Drop blank rows at the end only; blank rows in the middle are kept so validation can flag them.
function dropTrailingBlank(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && isBlankRow(rows[end - 1]!)) end -= 1;
  return rows.slice(0, end);
}

function toParsedFile(matrix: string[][]): ParsedFile {
  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = matrix[0]!.map(normalizeHeader);
  const body = dropTrailingBlank(matrix.slice(1));
  const rows = body.map((vals) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      // duplicate headers: keep first, validator reports DUPLICATE_COLUMN from `headers`
      if (!(h in rec)) rec[h] = (vals[i] ?? '').trim();
    });
    return rec;
  });
  return { headers, rows };
}

function parseCsv(buffer: Buffer): ParsedFile {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false,
      trim: false,
      cast: false,
    }) as string[][];
  } catch (e) {
    throw new ParseError(`CSV could not be parsed: ${(e as Error).message}`, 'CSV_PARSE_ERROR');
  }
  return toParsedFile(records);
}

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return v.result === undefined || v.result === null ? '' : String(v.result);
    if ('error' in v) return '';
    return String(v);
  }
  if (typeof v === 'number') {
    return cell.type === ExcelJS.ValueType.Number ? numberToPlainString(v) : String(v);
  }
  return String(v);
}

function numberToPlainString(n: number): string {
  // Avoid "1e+21" and float noise; amounts have at most 2 decimals.
  if (Number.isInteger(n)) return BigInt(n).toString();
  return n.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
}

async function parseXlsx(buffer: Buffer): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (e) {
    throw new ParseError(`XLSX could not be parsed: ${(e as Error).message}`, 'XLSX_PARSE_ERROR');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ParseError('XLSX has no worksheets', 'XLSX_PARSE_ERROR');
  const matrix: string[][] = [];
  const colCount = ws.actualColumnCount || ws.columnCount;
  ws.eachRow({ includeEmpty: true }, (r) => {
    const vals: string[] = [];
    for (let c = 1; c <= colCount; c += 1) vals.push(cellToString(r.getCell(c)));
    matrix[r.number - 1] = vals;
  });
  for (let i = 0; i < matrix.length; i += 1) matrix[i] ??= [];
  return toParsedFile(matrix);
}

export async function parseUpload(buffer: Buffer, filename: string): Promise<ParsedFile> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.csv') return parseCsv(buffer);
  if (ext === '.xlsx') return parseXlsx(buffer);
  throw new ParseError(`Unsupported file type "${ext || '(none)'}": upload .csv or .xlsx`, 'UNSUPPORTED_FILE_TYPE');
}
