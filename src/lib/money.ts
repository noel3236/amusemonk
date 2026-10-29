const AMOUNT_RE = /^(0|[1-9]\d*)(\.\d{1,2})?$/;

export function parseInrToPaise(input: string): bigint | null {
  const s = input.trim().replace(/,/g, '');
  if (!AMOUNT_RE.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const fracPadded = (frac + '00').slice(0, 2);
  return BigInt(whole!) * 100n + BigInt(fracPadded);
}

/** Format paise as a plain decimal string with exactly 2 decimals: 123450n -> "1234.50". */
export function paiseToInr(paise: bigint | number | string): string {
  const p = BigInt(paise);
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

/** Indian grouping for display: 1234567.89 -> "12,34,567.89" */
export function formatInr(paise: bigint | number | string): string {
  const s = paiseToInr(paise);
  const [whole, frac] = s.split('.');
  const neg = whole!.startsWith('-');
  const digits = neg ? whole!.slice(1) : whole!;
  if (digits.length <= 3) return `${neg ? '-' : ''}${digits}.${frac}`;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${rest},${last3}.${frac}`;
}

/** Gateway sends "15000.50" style strings; parse leniently (may have >2 decimals) into paise, rounding down. */
export function parseGatewayAmount(input: string | number | null | undefined): bigint | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s.startsWith('-');
  const [whole, frac = ''] = (neg ? s.slice(1) : s).split('.');
  const v = BigInt(whole!) * 100n + BigInt((frac + '00').slice(0, 2));
  return neg ? -v : v;
}
