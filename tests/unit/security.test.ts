import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { toCsv } from '@/lib/csv';

describe('secret encryption', () => {
  it('round-trips and hides the plaintext', () => {
    const enc = encryptSecret('s3cr3t', 'user_api_keys:kidA');
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain('s3cr3t');
    expect(decryptSecret(enc, 'user_api_keys:kidA')).toBe('s3cr3t');
  });

  it('fails when moved to another key id or tampered with', () => {
    const enc = encryptSecret('s3cr3t', 'user_api_keys:kidA');
    expect(() => decryptSecret(enc, 'user_api_keys:kidB')).toThrow();
    const parts = enc.split(':');
    parts[3] = Buffer.from('xxxxxx').toString('base64');
    expect(() => decryptSecret(parts.join(':'), 'user_api_keys:kidA')).toThrow();
  });
});

describe('CSV export', () => {
  it('quotes, escapes, and defuses spreadsheet formulas', () => {
    const out = toCsv(['a', 'b'], [
      ['plain', 'with,comma'],
      ['say "hi"', '=HYPERLINK("x")'],
      ['-2+3', '@SUM(A1)'],
      [null, 42],
    ]);
    expect(out.split('\r\n')).toEqual(['a,b', 'plain,"with,comma"', '"say ""hi""","\'=HYPERLINK(""x"")"', "'-2+3,'@SUM(A1)", ',42', '']);
  });
});
