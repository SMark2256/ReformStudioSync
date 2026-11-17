import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EmailAutomationDto,
  EmailAutomationKind,
  EmailCategory,
  UpdateEmailAutomationDto,
} from '@reform/shared';
import React from 'react';
import { AUTOMATION_LABEL, EMAIL_CATEGORY_LABEL } from '@/entities/email';
import { api } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
} from '@/shared/ui';
import { MAIL_QUERY_KEYS } from '../model/queries';

const DESCRIPTION: Record<EmailAutomationKind, string> = {
  [EmailAutomationKind.WELCOME]:
    'Új vendég felvételekor, ha van e-mail címe. Szolgáltatási levél, hozzájárulás nélkül is kimegy.',
  [EmailAutomationKind.BIRTHDAY]:
    'A születésnapon 8 órától. Marketing levél: csak hozzájáruló vendégnek, leiratkozó linkkel.',
  [EmailAutomationKind.NAME_DAY]:
    'A névnapon (HH-NN) 8 órától. Marketing levél: csak hozzájáruló vendégnek, leiratkozó linkkel.',
};

const NO_TEMPLATE = '__none__';

// Automatikus levelek (TICKET-55): külön be- és kikapcsolható, sablon rendelhető hozzájuk.
// A kapcsoló azonnal érvényes (UI-specifikáció 5.3); bekapcsolni csak sablonnal lehet.
export const AutomationsSection: React.FC = () => {
  const queryClient = useQueryClient();
  const automationsQuery = useQuery({
    queryKey: MAIL_QUERY_KEYS.automations,
    queryFn: () => api.getEmailAutomations(),
  });
  const templatesQuery = useQuery({
    queryKey: MAIL_QUERY_KEYS.templates,
    queryFn: () => api.getEmailTemplates(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ kind, data }: { kind: EmailAutomationKind; data: UpdateEmailAutomationDto }) =>
      api.updateEmailAutomation(kind, data),
    onSuccess: (a) => {
      notify.success(
        `${AUTOMATION_LABEL[a.kind]}: ${a.enabled ? 'bekapcsolva' : 'kikapcsolva'}`,
        a.templateName ? `Sablon: ${a.templateName}` : 'Nincs sablon beállítva.',
      );
      void queryClient.invalidateQueries({ queryKey: MAIL_QUERY_KEYS.automations });
      void queryClient.invalidateQueries({ queryKey: MAIL_QUERY_KEYS.templates });
    },
  });

  const templates = templatesQuery.data ?? [];

  const row = (a: EmailAutomationDto) => {
    const titleId = `automation-${a.kind}`;
    return (
      <div
        key={a.kind}
        data-testid={`automation-${a.kind}`}
        className="grid gap-x-6 gap-y-2.5 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_260px_auto] md:items-center"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={titleId} className="text-[13px] font-semibold text-foreground">
              {AUTOMATION_LABEL[a.kind]}
            </h3>
            <Badge variant="secondary">{EMAIL_CATEGORY_LABEL[a.category]}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{DESCRIPTION[a.kind]}</p>
        </div>
        <Select
          value={a.templateId ?? NO_TEMPLATE}
          onValueChange={(v) =>
            updateMutation.mutate({
              kind: a.kind,
              data: v === NO_TEMPLATE ? { templateId: null, enabled: false } : { templateId: v },
            })
          }
        >
          <SelectTrigger aria-label={`${AUTOMATION_LABEL[a.kind]} sablonja`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TEMPLATE}>Nincs beállítva</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            checked={a.enabled}
            disabled={!a.templateId || updateMutation.isPending}
            aria-labelledby={titleId}
            onCheckedChange={(enabled) => updateMutation.mutate({ kind: a.kind, data: { enabled } })}
          />
          <span className="text-[13px] text-muted-foreground">
            {a.enabled ? 'Bekapcsolva' : 'Kikapcsolva'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automatikus levelek</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {automationsQuery.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          (automationsQuery.data ?? []).map(row)
        )}
      </CardContent>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground md:px-5">
        A születés- és névnapi levelet a rendszer naponta egyszer küldi (Budapest szerint), egy
        vendégnek évente legfeljebb egyszer; újraindítás után sem megy ki kétszer.{' '}
        {EMAIL_CATEGORY_LABEL[EmailCategory.MARKETING]} levél csak a vendég hozzájárulásával.
      </p>
    </Card>
  );
};
