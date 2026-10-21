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

export enum GuestStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PAUSED = 'PAUSED',
}

export enum ServiceCategory {
  CIRCUIT = 'CIRCUIT',
  COSMETIC = 'COSMETIC',
  BODY_SHAPING = 'BODY_SHAPING',
}

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  TERMINATED = 'TERMINATED',
}

export enum MembershipDueStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  WAIVED = 'WAIVED',
}

export enum OverdueBucket {
  NONE = 'NONE',
  DAYS_1_5 = 'DAYS_1_5',
  DAYS_6_15 = 'DAYS_6_15',
  DAYS_OVER_15 = 'DAYS_OVER_15',
}

export enum VisitType {
  CIRCUIT_TRAINING = 'CIRCUIT_TRAINING',
  TREATMENT = 'TREATMENT',
}

export enum DocumentStatus {
  PENDING_SIGNATURE = 'PENDING_SIGNATURE',
  SIGNED = 'SIGNED',
}

export enum DocumentType {
  GDPR_CONSENT = 'GDPR_CONSENT',
  HEALTH_QUESTIONNAIRE = 'HEALTH_QUESTIONNAIRE',
  HOUSE_RULES = 'HOUSE_RULES',
  TREATMENT_CONSENT = 'TREATMENT_CONSENT',
}

export enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

export type CheckInWarningCode =
  | 'LAST_OCCASION'
  | 'LOW_OCCASIONS'
  | 'EXPIRING_SOON'
  | 'OVERDUE_DUES'
  | 'MEMBERSHIP_PAUSED'
  | 'EXPIRED_PASS'
  | 'DEPLETED_PASS';

export type MonitorEventMode = 'CIRCUIT_GREETING' | 'TREATMENT_GREETING';

export const DEFAULT_STUDIO_ID = 'default-studio';
export const DUPLICATE_SCAN_COOLDOWN_SECONDS = 10;
export const EXPIRING_SOON_THRESHOLD_DAYS = 3;
export const DEFAULT_MONITOR_GREETING_SECONDS = 7;
export const MONITOR_BROADCAST_CHANNEL = 'reform_monitor_channel';
export const SCANNER_BROADCAST_CHANNEL = 'reform_studio_scanner_channel';
