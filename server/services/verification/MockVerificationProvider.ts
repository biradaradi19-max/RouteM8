import crypto from 'node:crypto';
import type {
  IVerificationProvider,
  InitiateIdentityVerificationInput,
  InitiateIdentityVerificationResult,
  ConfirmIdentityVerificationInput,
  ConfirmIdentityVerificationResult,
  VerifyVehicleCredentialsInput,
  VerifyVehicleCredentialsResult,
} from './IVerificationProvider.js';

export class MockVerificationProvider implements IVerificationProvider {
  readonly providerName = 'mock';

  private ensureNonProduction(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SECURITY VIOLATION: MockVerificationProvider is strictly forbidden in production. Configure a verified OVSE/KYC provider.'
      );
    }
  }

  async initiateIdentityVerification(
    input: InitiateIdentityVerificationInput
  ): Promise<InitiateIdentityVerificationResult> {
    this.ensureNonProduction();

    if (!input.consentObtained) {
      throw new Error('Explicit user consent must be recorded prior to initiating verification.');
    }

    const providerReferenceId = `mock_ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const mockMasked = input.idType === 'aadhaar_offline' ? 'XXXXXXXX8901' : 'ABCDE****F';
    const verificationHash = crypto
      .createHash('sha256')
      .update(`${input.userId}:${input.idType}:${providerReferenceId}`)
      .digest('hex');

    return {
      providerReferenceId,
      status: 'pending',
      maskedId: mockMasked,
      verificationHash,
    };
  }

  async confirmIdentityVerification(
    input: ConfirmIdentityVerificationInput
  ): Promise<ConfirmIdentityVerificationResult> {
    this.ensureNonProduction();

    const verificationHash = crypto
      .createHash('sha256')
      .update(`confirmed:${input.providerReferenceId}`)
      .digest('hex');

    return {
      providerReferenceId: input.providerReferenceId,
      status: 'verified',
      maskedId: 'XXXXXXXX8901',
      verificationHash,
    };
  }

  async verifyVehicleCredentials(
    input: VerifyVehicleCredentialsInput
  ): Promise<VerifyVehicleCredentialsResult> {
    this.ensureNonProduction();

    if (input.vehicleCategory === 'bicycle' || input.vehicleCategory === 'none') {
      return {
        status: 'exempt',
        isExempt: true,
      };
    }

    const dl = input.drivingLicenceNumber || 'DL-0420110012345';
    const rc = input.registrationNumber || 'MH-12-AB-1234';

    const dlMasked = dl.length > 4 ? `DL-XXXX-${dl.slice(-4)}` : 'DL-XXXX';
    const rcMasked = rc.length > 4 ? `MH-XX-XX-${rc.slice(-4)}` : 'XX-XX-XXXX';

    return {
      status: 'verified',
      isExempt: false,
      drivingLicenceMasked: dlMasked,
      drivingLicenceHash: crypto.createHash('sha256').update(dl).digest('hex'),
      registrationNumberMasked: rcMasked,
      registrationHash: crypto.createHash('sha256').update(rc).digest('hex'),
    };
  }
}

export const mockVerificationProvider = new MockVerificationProvider();

