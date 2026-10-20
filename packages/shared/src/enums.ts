export enum Role {
  ADMIN = 'ADMIN',
  RECEPTIONIST = 'RECEPTIONIST',
}

export enum PassType {
  OCCASION_BASED = 'OCCASION_BASED',
  TIME_BASED = 'TIME_BASED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  POS_CARD = 'POS_CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum CheckInStatus {
  SUCCESS = 'SUCCESS',
  DENIED = 'DENIED',
  DUPLICATE_SCAN = 'DUPLICATE_SCAN',
  CANCELLED = 'CANCELLED',
}

export type CheckInWarningCode = 'LAST_OCCASION' | 'EXPIRING_SOON';

export const DEFAULT_STUDIO_ID = 'default-studio';
export const DUPLICATE_SCAN_COOLDOWN_SECONDS = 60;
export const EXPIRING_SOON_THRESHOLD_DAYS = 3;
export const MONITOR_BROADCAST_CHANNEL = 'reform_monitor_channel';
