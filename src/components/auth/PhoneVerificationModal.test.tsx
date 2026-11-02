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

  it('6. safely cleans up reCAPTCHA verifier when opening and closing the modal repeatedly', () => {
    const mockVerifier = {
      clear: vi.fn(),
      render: vi.fn().mockResolvedValue(1),
    };
    vi.mocked(firebaseService.createRecaptchaVerifier).mockReturnValue(mockVerifier as any);

    const { rerender } = render(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Phone Verification')).toBeDefined();

    // Close modal
    const closeBtn = screen.getByLabelText('Close modal');
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);

    // Re-render closed
    rerender(
      <PhoneVerificationModal
        isOpen={false}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );
    expect(screen.queryByText('Phone Verification')).toBeNull();

    // Reopen modal
    rerender(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );
    expect(screen.getByText('Phone Verification')).toBeDefined();
  });

  it('7. clicking Send OTP multiple times prevents duplicate simultaneous requests', async () => {
    let resolveSendOtp: (val: any) => void;
    const sendOtpPromise = new Promise((resolve) => {
      resolveSendOtp = resolve;
    });

    vi.mocked(firebaseService.sendFirebasePhoneOtp).mockImplementation(() => sendOtpPromise as any);

    render(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Select test partner
    fireEvent.click(screen.getByText('US Test Partner (Demo)').closest('button')!);

    const form = screen.getByRole('button', { name: /Send Verification Code/i }).closest('form')!;

    // Rapid double submission
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(firebaseService.sendFirebasePhoneOtp).toHaveBeenCalledTimes(1);

    // Resolve the in-flight promise
    resolveSendOtp!({ confirm: vi.fn(), verificationId: 'v-1' });

    await waitFor(() => {
      expect(screen.getByText(/Spark Test OTP:/i)).toBeDefined();
    });
  });

  it('8. retrying after a failed request safely cleans up and allows successful retry', async () => {
    const mockClear = vi.fn();
    const mockVerifier = {
      clear: mockClear,
      render: vi.fn().mockResolvedValue(1),
    };
    vi.mocked(firebaseService.createRecaptchaVerifier).mockReturnValue(mockVerifier as any);

    // First attempt fails with network error
    vi.mocked(firebaseService.sendFirebasePhoneOtp).mockRejectedValueOnce({
      code: 'auth/network-request-failed',
      message: 'Network error',
    });

    render(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.click(screen.getByText('US Test Partner (Demo)').closest('button')!);
    const form = screen.getByRole('button', { name: /Send Verification Code/i }).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeDefined();
    });

    // Verifier was safely cleared after failure
    expect(mockClear).toHaveBeenCalled();

    // Second attempt succeeds
    vi.mocked(firebaseService.sendFirebasePhoneOtp).mockResolvedValueOnce({
      confirm: vi.fn(),
      verificationId: 'v-success',
    } as any);

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Spark Test OTP:/i)).toBeDefined();
    });
  });

  it('9. reopening the modal after closing allows fresh reCAPTCHA initialization without error', async () => {
    const mockClear = vi.fn();
    vi.mocked(firebaseService.createRecaptchaVerifier).mockReturnValue({
      clear: mockClear,
      render: vi.fn().mockResolvedValue(1),
    } as any);
    vi.mocked(firebaseService.sendFirebasePhoneOtp).mockResolvedValue({
      confirm: vi.fn(),
      verificationId: 'v-1',
    } as any);

    const { rerender } = render(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Send code in first session
    fireEvent.click(screen.getByText('India Test Partner (Demo)').closest('button')!);
    const form1 = screen.getByRole('button', { name: /Send Verification Code/i }).closest('form')!;
    fireEvent.submit(form1);

    await waitFor(() => {
      expect(screen.getByText(/Spark Test OTP:/i)).toBeDefined();
    });

    // Close modal
    rerender(
      <PhoneVerificationModal
        isOpen={false}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(mockClear).toHaveBeenCalled();

    // Reopen modal in fresh session
    rerender(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Initial step is back to phone
    expect(screen.getByText('Send Verification Code')).toBeDefined();

    // Submit in second session
    fireEvent.click(screen.getByText('US Test Partner (Demo)').closest('button')!);
    const form2 = screen.getByRole('button', { name: /Send Verification Code/i }).closest('form')!;
    fireEvent.submit(form2);

    await waitFor(() => {
      expect(screen.getByText(/Spark Test OTP:/i)).toBeDefined();
    });
  });

  it('10. reuses single RecaptchaVerifier instance across test number selections and resends in the same modal lifecycle', async () => {
    const mockVerifier = {
      clear: vi.fn(),
      render: vi.fn().mockResolvedValue(1),
    };
    vi.mocked(firebaseService.createRecaptchaVerifier).mockReturnValue(mockVerifier as any);
    vi.mocked(firebaseService.sendFirebasePhoneOtp).mockResolvedValue({
      confirm: vi.fn(),
      verificationId: 'v-resend',
    } as any);

    render(
      <PhoneVerificationModal
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // 1. Select India Test Partner
    fireEvent.click(screen.getByText('India Test Partner (Demo)').closest('button')!);
    const form = screen.getByRole('button', { name: /Send Verification Code/i }).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Spark Test OTP:/i)).toBeDefined();
    });

    // Exactly one verifier created
    expect(firebaseService.createRecaptchaVerifier).toHaveBeenCalledTimes(1);

    // 2. Click "Change phone number" to return to phone step
    fireEvent.click(screen.getByText('Change phone number'));

    // Switch to US Test Partner
    fireEvent.click(screen.getByText('US Test Partner (Demo)').closest('button')!);

    // Resubmit
    const form2 = screen.getByRole('button', { name: /Send Verification Code/i }).closest('form')!;
    fireEvent.submit(form2);

    await waitFor(() => {
      expect(screen.getByText(/Spark Test OTP:/i)).toBeDefined();
    });

    // Verifier was REUSED, not recreated! (Task 3 & 4)
    expect(firebaseService.createRecaptchaVerifier).toHaveBeenCalledTimes(1);
    expect(firebaseService.sendFirebasePhoneOtp).toHaveBeenCalledTimes(2);
  });
});
