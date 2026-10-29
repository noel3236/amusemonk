import { describe, expect, it } from 'vitest';
import { formatInr, paiseToInr, parseGatewayAmount, parseInrToPaise } from '@/lib/money';

describe('money', () => {
  it('parses INR strings to integer paise', () => {
    expect(parseInrToPaise('100')).toBe(10000n);
    expect(parseInrToPaise('100.5')).toBe(10050n);
    expect(parseInrToPaise('0.01')).toBe(1n);
    expect(parseInrToPaise(' 1,23,456.78 ')).toBe(12345678n);
  });

  it('rejects malformed amounts', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '01', '.5', '5.', '1e3', '100 INR']) expect(parseInrToPaise(bad), bad).toBeNull();
  });

  it('formats paise as decimals and with Indian grouping', () => {
    expect(paiseToInr(10050n)).toBe('100.50');
    expect(paiseToInr(5n)).toBe('0.05');
    expect(formatInr(123456789n)).toBe('12,34,567.89');
    expect(formatInr('100')).toBe('1.00');
  });

  it('reads gateway amounts leniently, rounding down past two decimals', () => {
    expect(parseGatewayAmount('15000.50')).toBe(1500050n);
    expect(parseGatewayAmount('15.009')).toBe(1500n);
    expect(parseGatewayAmount(null)).toBeNull();
    expect(parseGatewayAmount('x')).toBeNull();
  });
});
