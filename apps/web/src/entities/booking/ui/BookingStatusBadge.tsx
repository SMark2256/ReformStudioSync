import { BookingStatus } from '@reform/shared';
import React from 'react';
import { Badge } from '@/shared/ui';
import { BOOKING_STATUS_BADGE, bookingStatusLabel } from '../model/format';

export const BookingStatusBadge: React.FC<{ status: BookingStatus }> = ({ status }) => (
  <Badge variant={BOOKING_STATUS_BADGE[status]}>{bookingStatusLabel(status)}</Badge>
);
