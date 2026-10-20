import {
  CheckInStatus,
  PassType,
  PaymentMethod,
  Role,
} from '../enums';
import { CheckInResultPayload } from '../socket-events';

export interface AuthUserDto {
  id: string;
  studioId: string;
  email: string;
  name: string;
  role: Role;
}

export interface LoginResponseDto {
  accessToken: string;
  user: AuthUserDto;
}

export interface PassTemplateDto {
  id: string;
  studioId: string;
  name: string;
  type: PassType;
  totalPasses: number | null;
  durationDays: number;
  price: number;
  isActive: boolean;
  createdAt: string;
}

export interface PassUsageLogDto {
  id: string;
  guestPassId: string;
  delta: number;
  usedAt: string;
  note: string | null;
}

export interface GuestPassDto {
  id: string;
  studioId: string;
  guestId: string;
  passTemplateId: string;
  passTemplateName?: string;
  type: PassType;
  totalPasses: number | null;
  remainingPasses: number | null;
  startDate: string;
  expirationDate: string;
  isActive: boolean;
  isFrozen: boolean;
  frozenAt: string | null;
  createdAt: string;
  usageLogs?: PassUsageLogDto[];
}

export interface GuestDto {
  id: string;
  studioId: string;
  barcode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  passes?: GuestPassDto[];
}

export interface LoggedCheckInDto {
  id: string;
  studioId: string;
  guestId: string;
  guestName: string;
  guestBarcode: string;
  guestPassId: string | null;
  passName?: string | null;
  userId: string;
  staffName?: string;
  status: CheckInStatus;
  reason: string | null;
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  studioId: string;
  guestId: string;
  guestName: string;
  guestPassId: string | null;
  passName: string | null;
  recordedByUserId: string;
  recordedByName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  isCancelled: boolean;
  note: string | null;
  createdAt: string;
}

export interface DailyFinanceSummaryDto {
  date: string;
  totalRevenue: number;
  byMethod: {
    CASH: number;
    POS_CARD: number;
    BANK_TRANSFER: number;
  };
  activeTransactionCount: number;
  cancelledTransactionCount: number;
  payments: PaymentDto[];
}

export interface ScanCheckInRequestDto {
  barcode: string;
  forceDuplicate?: boolean;
  idempotencyKey?: string;
}

export interface OfflineScanItemDto {
  idempotencyKey: string;
  barcode: string;
  scannedAt: string;
}

export interface OfflineSyncResponseDto {
  processed: number;
  results: CheckInResultPayload[];
}

export type DisplayDeviceStatus = 'PENDING_PAIRING' | 'PAIRED' | 'EXPIRED';

export interface DisplayDeviceDto {
  id: string;
  name: string;
  status: DisplayDeviceStatus;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  pairedAt: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  lastActivityType: string | null;
  isOnline?: boolean;
  createdAt: string;
}

export interface PairDisplayResponseDto {
  deviceToken: string;
  device: DisplayDeviceDto;
}

