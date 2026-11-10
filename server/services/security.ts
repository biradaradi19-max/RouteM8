import crypto from 'node:crypto';

/**
 * Generate a cryptographically secure 4-digit numeric handover PIN.
 */
export function generateHandoverPin(): string {
  const num = crypto.randomInt(1000, 10000);
  return num.toString();
}

/**
 * Generate a random 16-byte hex salt for PIN hashing.
 */
export function generatePinSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash a 4-digit PIN with a salt using HMAC-SHA256.
 */
export function hashPin(pin: string, salt: string): string {
  const clean = pin.trim();
  return crypto.createHmac('sha256', salt).update(clean).digest('hex');
}

/**
 * Securely verify a submitted PIN against the stored hash using timing-safe comparison.
 */
export function verifyPinHash(pin: string, salt: string, expectedHash: string): boolean {
  if (!pin || !salt || !expectedHash) return false;
  const computedHash = hashPin(pin, salt);
  const bufComputed = Buffer.from(computedHash, 'hex');
  const bufExpected = Buffer.from(expectedHash, 'hex');

  if (bufComputed.length !== bufExpected.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufComputed, bufExpected);
}

