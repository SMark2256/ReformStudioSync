import { useQuery } from '@tanstack/react-query';
import { EmailTemplateDto } from '@reform/shared';
import React from 'react';
import { MAIL_QUERY_KEYS } from '@/entities/email';
import { api } from '@/shared/api';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui';

const CUSTOM = '__custom__';

interface EmailTemplateSelectProps {
  id: string;
  label: string;
  /** A kiválasztott sablon; `null`: egyedi levél. */
  value: string | null;
  /** A választott sablon (a hívó tölti be a tárgyát és a szövegét), vagy `null`: egyedi levél. */
  onSelect: (template: EmailTemplateDto | null) => void;
}

// Sablon választása egy levélhez (TICKET-55): csoportos küldés és egyéni levél az adatlapról.
export const EmailTemplateSelect: React.FC<EmailTemplateSelectProps> = ({
  id,
  label,
  value,
  onSelect,
}) => {
  const templatesQuery = useQuery({
    queryKey: MAIL_QUERY_KEYS.templates,
    queryFn: () => api.getEmailTemplates(),
  });
  const templates = templatesQuery.data ?? [];

  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? CUSTOM}
        onValueChange={(v) => onSelect(templates.find((t) => t.id === v) ?? null)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CUSTOM}>Egyedi levél</SelectItem>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
