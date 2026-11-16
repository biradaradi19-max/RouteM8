import type { IdDocumentType } from '../../models/IdentityVerification.js';
import type { VehicleCategory } from '../../models/PartnerApplication.js';

export interface InitiateIdentityVerificationInput {
  userId: string;
  applicantName: string;
  idType: IdDocumentType;
  consentObtained: boolean;
  consentVersion: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface InitiateIdentityVerificationResult {
  providerReferenceId: string;
  redirectUrl?: string;
  status: 'initiated' | 'pending' | 'verified';
  maskedId?: string;
  verificationHash?: string;
}

export interface ConfirmIdentityVerificationInput {
  providerReferenceId: string;
  verificationPayload?: Record<string, any>;
}

export interface ConfirmIdentityVerificationResult {
  providerReferenceId: string;
  status: 'verified' | 'failed' | 'rejected';
  maskedId: string;
  verificationHash: string;
  failureReason?: string;
}

export interface VerifyVehicleCredentialsInput {
  userId: string;
  vehicleCategory: VehicleCategory;
  drivingLicenceNumber?: string;
  registrationNumber?: string;
}

export interface VerifyVehicleCredentialsResult {
  status: 'verified' | 'failed' | 'exempt';
  isExempt: boolean;
  drivingLicenceMasked?: string;
  drivingLicenceHash?: string;
  registrationNumberMasked?: string;
  registrationHash?: string;
  failureReason?: string;
}

export interface IVerificationProvider {
  readonly providerName: string;

  initiateIdentityVerification(
    input: InitiateIdentityVerificationInput
  ): Promise<InitiateIdentityVerificationResult>;

  confirmIdentityVerification(
    input: ConfirmIdentityVerificationInput
  ): Promise<ConfirmIdentityVerificationResult>;

  verifyVehicleCredentials(
    input: VerifyVehicleCredentialsInput
  ): Promise<VerifyVehicleCredentialsResult>;
}

