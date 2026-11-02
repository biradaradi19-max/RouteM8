import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FIREBASE_TEST_PHONE_NUMBERS,
  getFirebaseAuthErrorMessage,
  sendFirebasePhoneOtp,
  confirmFirebasePhoneOtp,
  createRecaptchaVerifier,
  clearRecaptchaVerifier,
} from './firebase';
import * as firebaseAuth from 'firebase/auth';

vi.mock('firebase/auth', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    RecaptchaVerifier: vi.fn().mockImplementation(function () {
      return {
        render: vi.fn().mockResolvedValue(1),
        clear: vi.fn(),
      };
    }),
    signInWithPhoneNumber: vi.fn(),
    linkWithPhoneNumber: vi.fn(),
  };
});

describe('Firebase Phone Verification Service (Spark Tier & Blaze Readiness)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. provides preconfigured test phone numbers for Spark plan testing', () => {
    expect(FIREBASE_TEST_PHONE_NUMBERS.length).toBeGreaterThanOrEqual(3);
    const partnerTest = FIREBASE_TEST_PHONE_NUMBERS.find((t) => t.phoneNumber === '+1 650-555-1234');
    expect(partnerTest).toBeDefined();
    expect(partnerTest?.code).toBe('123456');

    const customerTest = FIREBASE_TEST_PHONE_NUMBERS.find((t) => t.phoneNumber === '+1 650-555-5678');
    expect(customerTest).toBeDefined();
    expect(customerTest?.code).toBe('654321');

    const inTest = FIREBASE_TEST_PHONE_NUMBERS.find((t) => t.phoneNumber === '+91 99999 12345');
    expect(inTest).toBeDefined();
    expect(inTest?.code).toBe('123456');
  });

  it('2. maps phone auth error codes to clear user guidance', () => {
    expect(getFirebaseAuthErrorMessage({ code: 'auth/quota-exceeded' })).toContain(
      'Real cellular SMS requires the Firebase Blaze plan'
    );
    expect(getFirebaseAuthErrorMessage({ code: 'auth/billing-not-enabled' })).toContain(
      'Cellular SMS delivery requires Firebase Blaze billing'
    );
    expect(getFirebaseAuthErrorMessage({ code: 'auth/invalid-verification-code' })).toContain(
      'Invalid 6-digit verification code'
    );
    expect(getFirebaseAuthErrorMessage({ code: 'auth/code-expired' })).toContain(
      'The verification code has expired'
    );
    expect(getFirebaseAuthErrorMessage({ code: 'auth/invalid-phone-number' })).toContain(
      'Please enter a valid phone number with country code'
    );
  });

  it('3. creates a RecaptchaVerifier instance and empties existing container children', () => {
    const container = document.createElement('div');
    container.innerHTML = '<iframe src="stale-recaptcha"></iframe>';
    expect(container.children.length).toBe(1);

    const verifier = createRecaptchaVerifier(container, { size: 'invisible' });
    expect(verifier).toBeDefined();
    expect(container.innerHTML).toBe('');
    expect(firebaseAuth.RecaptchaVerifier).toHaveBeenCalled();
  });

  it('4. sanitizes phone number and calls signInWithPhoneNumber when no user is signed in', async () => {
    const mockVerifier = {} as any;
    const mockConfirmation = { confirm: vi.fn() };
    vi.mocked(firebaseAuth.signInWithPhoneNumber).mockResolvedValueOnce(mockConfirmation as any);

    const res = await sendFirebasePhoneOtp('+1 (650) 555-1234', mockVerifier);
    expect(firebaseAuth.signInWithPhoneNumber).toHaveBeenCalledWith(
      expect.anything(),
      '+16505551234',
      mockVerifier
    );
    expect(res).toBe(mockConfirmation);
  });

  it('5. sanitizes 6-digit code and confirms with ConfirmationResult', async () => {
    const mockConfirm = vi.fn().mockResolvedValueOnce({ user: { uid: 'u1' } });
    const mockConfirmationResult: any = { confirm: mockConfirm };

    await confirmFirebasePhoneOtp(mockConfirmationResult, ' 123-456 ');
    expect(mockConfirm).toHaveBeenCalledWith('123456');
  });

  it('6. safely clears RecaptchaVerifier and empties target container', () => {
    const mockClear = vi.fn();
    const mockVerifier = { clear: mockClear } as any;
    const container = document.createElement('div');
    container.innerHTML = '<div>leftover widget</div>';

    clearRecaptchaVerifier(mockVerifier, container);
    expect(mockClear).toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });
});
