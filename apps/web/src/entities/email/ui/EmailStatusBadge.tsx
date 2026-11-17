import { MessageStatus } from '@reform/shared';
import React from 'react';
import { Badge } from '@/shared/ui';
import { MESSAGE_STATUS_BADGE, MESSAGE_STATUS_LABEL } from '../model/labels';

export const EmailStatusBadge: React.FC<{ status: MessageStatus }> = ({ status }) => (
  <Badge variant={MESSAGE_STATUS_BADGE[status] ?? 'secondary'}>
    {MESSAGE_STATUS_LABEL[status] ?? status}
  </Badge>
);
