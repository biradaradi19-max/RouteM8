import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhoneVerificationModal } from './PhoneVerificationModal';
import * as firebaseService from '../../services/firebase';

const mockRecordPhoneVerificationSuccess = vi.fn().mockResolvedValue(undefined);

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-123',
      fullName: 'Alex Test',
      phone: '',
      isPhoneVerified: false,
      trustScore: 85,
    },
    recordPhoneVerificationSuccess: mockRecordPhoneVerificationSuccess,
  }),
}));

vi.mock('../../services/firebase', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    createRecaptchaVerifier: vi.fn().mockReturnValue({
      clear: vi.fn(),
      render: vi.fn().mockResolvedValue(1),
    }),
    sendFirebasePhoneOtp: vi.fn(),
    confirmFirebasePhoneOtp: vi.fn(),
  };
});

describe('PhoneVerificationModal Component (Firebase Spark Phone Auth)', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. renders modal in phone input step with Spark test numbers and tier explanation', () => {
    render(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Phone Verification')).toBeDefined();
    expect(screen.getByText(/Firebase Free Spark Tier/i)).toBeDefined();
    expect(screen.getByText(/US Test Partner/i)).toBeDefined();
    expect(screen.getByText('+1 650-555-1234')).toBeDefined();
    expect(screen.getByText('Send Verification Code')).toBeDefined();
  });

  it('2. clicking a preconfigured test phone number fills input and highlights its code', () => {
    render(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const testPartnerBtn = screen.getByText('US Test Partner (Demo)').closest('button');
    expect(testPartnerBtn).toBeDefined();
    fireEvent.click(testPartnerBtn!);

    const input = screen.getByPlaceholderText('+1 650-555-1234') as HTMLInputElement;
    expect(input.value).toBe('+1 650-555-1234');
  });

  it('3. requests OTP code and transitions to 6-digit OTP verification screen', async () => {
    const mockConfirmationResult = {
      confirm: vi.fn(),
      verificationId: 'mock-verification-id',
    };
    vi.mocked(firebaseService.sendFirebasePhoneOtp).mockResolvedValueOnce(mockConfirmationResult as any);

    render(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const testPartnerBtn = screen.getByText('US Test Partner (Demo)').closest('button')!;
    fireEvent.click(testPartnerBtn);

    const form = screen.getByRole('button', { name: /Send Verification Code/i }).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Enter the 6-digit verification code sent to:/i)).toBeDefined();
      expect(screen.getByText(/Spark Test OTP:/i)).toBeDefined();
      expect(screen.getByText(/123456/)).toBeDefined();
    });
  });

  it('4. verifies 6-digit test code and invokes recordPhoneVerificationSuccess', async () => {
    const mockConfirmationResult = {
      confirm: vi.fn().mockResolvedValueOnce({
        user: { uid: 'test-user-123', phoneNumber: '+16505551234' },
      }),
      verificationId: 'mock-verification-id',
    };
    vi.mocked(firebaseService.sendFirebasePhoneOtp).mockResolvedValueOnce(mockConfirmationResult as any);
    vi.mocked(firebaseService.confirmFirebasePhoneOtp).mockResolvedValueOnce({
      user: { uid: 'test-user-123', phoneNumber: '+16505551234' } as any,
      providerId: 'phone',
      operationType: 'link',
    });

    render(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Select test number & submit
    fireEvent.click(screen.getByText('US Test Partner (Demo)').closest('button')!);
    const form = screen.getByRole('button', { name: /Send Verification Code/i }).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Spark Test OTP:/i)).toBeDefined();
    });

    // Click quick-fill pill for 123456
    const fillPill = screen.getByText(/Click to fill/i);
    fireEvent.click(fillPill);

    await waitFor(() => {
      expect(firebaseService.confirmFirebasePhoneOtp).toHaveBeenCalledWith(
        mockConfirmationResult,
        '123456'
      );
      expect(mockRecordPhoneVerificationSuccess).toHaveBeenCalledWith('+16505551234');
      expect(screen.getByText('Phone Number Verified!')).toBeDefined();
    });
  });

  it('5. displays friendly explanation when cellular SMS is attempted without Blaze plan', async () => {
    vi.mocked(firebaseService.sendFirebasePhoneOtp).mockRejectedValueOnce({
      code: 'auth/quota-exceeded',
      message: 'SMS quota exceeded for project',
    });

    render(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const input = screen.getByPlaceholderText('+1 650-555-1234');
    fireEvent.change(input, { target: { value: '+14155552671' } });
    const form = screen.getByRole('button', { name: /Send Verification Code/i }).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Firebase SMS quota exceeded/i)).toBeDefined();
      expect(screen.getByText(/Real cellular SMS requires the Firebase Blaze plan/i)).toBeDefined();
    });
  });
});
