import { EmailAutomationKind, EmailCategory, MessageStatus } from '@reform/shared';
import type { BadgeProps } from '@/shared/ui';

// A kimenő levelek feliratai (TICKET-55): állapot, forrás, kategória.

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  [MessageStatus.PENDING]: 'Várakozik',
  [MessageStatus.SENT]: 'Elküldve',
  [MessageStatus.FAILED]: 'Hibás',
};

export const MESSAGE_STATUS_BADGE: Record<MessageStatus, BadgeProps['variant']> = {
  [MessageStatus.PENDING]: 'warning',
  [MessageStatus.SENT]: 'success',
  [MessageStatus.FAILED]: 'destructive',
};

export const AUTOMATION_LABEL: Record<EmailAutomationKind, string> = {
  [EmailAutomationKind.WELCOME]: 'Üdvözlő levél',
  [EmailAutomationKind.BIRTHDAY]: 'Születésnapi levél',
  [EmailAutomationKind.NAME_DAY]: 'Névnapi levél',
};

const MESSAGE_TYPE_LABEL: Record<string, string> = {
  ...AUTOMATION_LABEL,
  MANUAL: 'Egyéni levél',
  BULK: 'Csoportos levél',
  TEST: 'Tesztlevél',
};

/** A napló „Típus” oszlopa; a TICKET-55 előtti szabad szöveges típus változatlanul látszik. */
export const messageTypeLabel = (type: string): string => MESSAGE_TYPE_LABEL[type] ?? type;

export const MESSAGE_TYPE_OPTIONS = Object.entries(MESSAGE_TYPE_LABEL).map(([value, label]) => ({
  value,
  label,
}));

export const EMAIL_CATEGORY_LABEL: Record<EmailCategory, string> = {
  [EmailCategory.TRANSACTIONAL]: 'Tranzakciós',
  [EmailCategory.MARKETING]: 'Marketing',
};
