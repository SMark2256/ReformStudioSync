import { INTAKE_STATUS_LABELS, IntakeStatus } from '@reform/shared';
import React from 'react';
import { Badge, type BadgeProps } from '@/shared/ui';

const STATUS_VARIANT: Record<IntakeStatus, NonNullable<BadgeProps['variant']>> = {
  [IntakeStatus.PREPARED]: 'secondary',
  [IntakeStatus.GUEST_FILLING]: 'secondary',
  [IntakeStatus.AWAITING_REVIEW]: 'warning',
  [IntakeStatus.APPROVED]: 'secondary',
  [IntakeStatus.COMPLETED]: 'success',
  [IntakeStatus.FAILED]: 'destructive',
  [IntakeStatus.CANCELLED]: 'secondary',
};

export const IntakeStatusBadge: React.FC<{ status: IntakeStatus }> = ({ status }) => (
  <Badge variant={STATUS_VARIANT[status]}>{INTAKE_STATUS_LABELS[status]}</Badge>
);
