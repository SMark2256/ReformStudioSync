import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AudiencePassState,
  EmailAudienceFilterDto,
  EmailAudienceRecipientDto,
  EmailTemplateDto,
} from '@reform/shared';
import React, { useMemo, useState } from 'react';
import { MAIL_QUERY_KEYS } from '@/entities/email';
import {
  draftHasContent,
  EmailComposer,
  EmailDraft,
  EmailTemplateSelect,
  EMPTY_DRAFT,
} from '@/features/compose-email';
import { api } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmActionButton,
  Input,
  Label,
  ResponsiveTable,
  type ResponsiveTableColumn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/ui';

const PASS_STATE_OPTIONS: { value: AudiencePassState; label: string }[] = [
  { value: 'ANY', label: 'Mindegy' },
  { value: 'CURRENT', label: 'Van érvényes' },
  { value: 'LAPSED', label: 'Lejárt' },
  { value: 'NEVER', label: 'Soha nem volt' },
];

type VisitMode = 'ANY' | 'WITHIN' | 'NOT_WITHIN';

const RECIPIENT_COLUMNS: ResponsiveTableColumn<EmailAudienceRecipientDto>[] = [
  { key: 'name', header: 'Név', rowHeader: true, cell: (r) => r.name },
  { key: 'email', header: 'E-mail', cell: (r) => r.email },
];

// Csoportos küldés (TICKET-55, csak admin): szűrő → címzettlista → levél → megerősítés. Marketing
// levél: csak a hozzájáruló, e-mail címmel rendelkező vendégek kapják, leiratkozó linkkel.
export const BulkSection: React.FC = () => {
  const queryClient = useQueryClient();
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [passState, setPassState] = useState<AudiencePassState>('ANY');
  const [visitMode, setVisitMode] = useState<VisitMode>('ANY');
  const [visitDays, setVisitDays] = useState(30);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmailDraft>(EMPTY_DRAFT);

  const filter = useMemo<EmailAudienceFilterDto>(
    () => ({
      serviceIds,
      passState,
      lastVisit:
        visitMode === 'ANY' || !(visitDays > 0) ? null : { mode: visitMode, days: visitDays },
    }),
    [serviceIds, passState, visitMode, visitDays],
  );

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: () => api.getServices() });
  const audienceQuery = useQuery({
    queryKey: [...MAIL_QUERY_KEYS.audience, filter],
    queryFn: () => api.previewEmailAudience(filter),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      api.sendBulkEmail({
        filter,
        guestIds: (audienceQuery.data?.recipients ?? []).map((r) => r.guestId),
        subject: draft.subject,
        bodyHtml: draft.bodyHtml,
        templateId,
      }),
    onSuccess: (res) => {
      notify.success(
        `${res.queued} levél a kimenő sorban.`,
        res.skipped > 0 ? `${res.skipped} címzett időközben kiesett.` : undefined,
      );
      void queryClient.invalidateQueries({ queryKey: MAIL_QUERY_KEYS.messages });
      void queryClient.invalidateQueries({ queryKey: MAIL_QUERY_KEYS.status });
    },
  });

  const loadTemplate = (template: EmailTemplateDto | null) => {
    setTemplateId(template?.id ?? null);
    if (template) setDraft({ subject: template.subject, bodyHtml: template.bodyHtml });
  };

  const toggleService = (id: string, checked: boolean) =>
    setServiceIds((prev) => (checked ? [...prev, id] : prev.filter((s) => s !== id)));

  const preview = audienceQuery.data;
  const total = preview?.total ?? 0;

  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Címzettek</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">Szolgáltatás</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(servicesQuery.data ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`bulk-service-${s.id}`}
                    checked={serviceIds.includes(s.id)}
                    onCheckedChange={(c) => toggleService(s.id, c === true)}
                  />
                  <Label htmlFor={`bulk-service-${s.id}`} className="text-[13px] font-normal text-foreground">
                    {s.name}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Ha nem jelölsz be semmit: mindegy.</p>
          </fieldset>

          <div className="space-y-2">
            <p id="bulk-pass-state" className="text-xs font-semibold text-muted-foreground">
              Bérlet vagy tagság
            </p>
            <ToggleGroup
              type="single"
              aria-labelledby="bulk-pass-state"
              value={passState}
              onValueChange={(v) => v && setPassState(v as AudiencePassState)}
              className="flex-wrap"
            >
              {PASS_STATE_OPTIONS.map((o) => (
                <ToggleGroupItem key={o.value} value={o.value}>
                  {o.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex w-full flex-col gap-1.5 sm:w-64">
              <Label htmlFor="bulk-visit-mode">Utolsó látogatás</Label>
              <Select value={visitMode} onValueChange={(v) => setVisitMode(v as VisitMode)}>
                <SelectTrigger id="bulk-visit-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">Mindegy</SelectItem>
                  <SelectItem value="WITHIN">Járt az elmúlt … napban</SelectItem>
                  <SelectItem value="NOT_WITHIN">Nem járt az elmúlt … napban</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {visitMode !== 'ANY' && (
              <div className="flex w-32 flex-col gap-1.5">
                <Label htmlFor="bulk-visit-days">Napok száma</Label>
                <Input
                  id="bulk-visit-days"
                  type="number"
                  min={1}
                  max={3650}
                  data-barcode-ignore
                  value={visitDays}
                  onChange={(e) => setVisitDays(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          <div aria-live="polite" className="text-sm" data-testid="bulk-audience-summary">
            {preview ? (
              <p>
                <span className="font-semibold tabular-nums text-foreground">{total}</span> címzett
                kapja meg
                <span className="text-muted-foreground">
                  {' '}
                  (a szűrőnek {preview.matched} vendég felel meg; nincs e-mail címe:{' '}
                  {preview.excluded.NO_EMAIL}, nem járult hozzá vagy leiratkozott:{' '}
                  {preview.excluded.NO_CONSENT})
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground">A címzettek számolása…</p>
            )}
          </div>
        </CardContent>
        <div className="max-h-[360px] overflow-y-auto border-t border-border">
          <ResponsiveTable
            caption="A levél címzettjei"
            columns={RECIPIENT_COLUMNS}
            rows={preview?.recipients ?? []}
            getRowId={(r) => r.guestId}
            emptyText="Nincs címzett a szűrő szerint. Lazíts a feltételeken."
          />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Levél</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EmailTemplateSelect
            id="bulk-template"
            label="Sablon betöltése"
            value={templateId}
            onSelect={loadTemplate}
          />
          <EmailComposer idPrefix="bulk" value={draft} onChange={setDraft} marketing />
          <Alert>
            <AlertDescription>
              A levelek a kimenő sorba kerülnek, és óránkénti korláttal mennek ki. A láblécben
              minden címzett saját leiratkozó linket kap.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex justify-end">
          <ConfirmActionButton
            variant="primary"
            disabled={total === 0 || !draftHasContent(draft) || sendMutation.isPending}
            confirmLabel={`Küldés ${total} címzettnek`}
            description={`A(z) „${draft.subject.trim()}” tárgyú levél ${total} vendégnek megy ki. A küldés nem vonható vissza.`}
            onConfirm={() => sendMutation.mutate()}
          >
            Küldés
          </ConfirmActionButton>
        </CardFooter>
      </Card>
    </div>
  );
};
