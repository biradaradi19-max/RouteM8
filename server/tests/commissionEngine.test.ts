import { describe, it, expect } from 'vitest';
import { calculateCommissionSync, calculateCommission } from '../services/commissionEngine.js';

describe('Marketplace Commission Engine — Integer Paise Arithmetic', () => {
  it('accurately splits standard ₹500 delivery with 10% commission into integer paise', async () => {
    // ₹500 = 50,000 paise
    const amountPaise = 50000;
    const result = await calculateCommission(amountPaise, 10.0);

    expect(result.amountPaise).toBe(50000);
    expect(result.commissionRatePercent).toBe(10.0);
    expect(result.platformSharePaise).toBe(5000); // ₹50.00
    expect(result.partnerSharePaise).toBe(45000); // ₹450.00
    expect(result.platformSharePaise + result.partnerSharePaise).toBe(amountPaise);
    expect(Number.isInteger(result.platformSharePaise)).toBe(true);
    expect(Number.isInteger(result.partnerSharePaise)).toBe(true);
  });

  it('guarantees zero rounding discrepancy with odd amounts and fractional percentages', () => {
    // Example: ₹333.33 = 33,333 paise at 12.5%
    const amountPaise = 33333;
    const result = calculateCommissionSync(amountPaise, 12.5);

    expect(result.platformSharePaise + result.partnerSharePaise).toBe(amountPaise);
    expect(Number.isInteger(result.platformSharePaise)).toBe(true);
    expect(Number.isInteger(result.partnerSharePaise)).toBe(true);
  });

  it('handles 0% commission without errors', () => {
    const amountPaise = 25000;
    const result = calculateCommissionSync(amountPaise, 0.0);

    expect(result.platformSharePaise).toBe(0);
    expect(result.partnerSharePaise).toBe(25000);
  });

  it('rejects floating-point or negative paise amounts to prevent financial rounding drift', () => {
    expect(() => calculateCommissionSync(500.5, 10)).toThrow(/integer/i);
    expect(() => calculateCommissionSync(-100, 10)).toThrow();
  });

  it('rejects invalid commission rates exceeding 50% boundary', () => {
    expect(() => calculateCommissionSync(50000, 60)).toThrow(/between 0% and 50%/i);
    expect(() => calculateCommissionSync(50000, -5)).toThrow(/between 0% and 50%/i);
  });
});

