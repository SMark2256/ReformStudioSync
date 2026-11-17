import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GuestDto, placeholderValuesFor } from '@reform/shared';
import React, { useState } from 'react';
import { EmailStatusBadge, messageTypeLabel } from '@/entities/email';
import { draftHasContent, EmailComposer, EmailDraft, EMPTY_DRAFT } from '@/features/compose-email';
import { api } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import {
  Alert,
  AlertDescription,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

const NO_TEMPLATE = '__none__';

const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('hu-HU') : '–';

/** A vendég leveleinek lekérdezési kulcsa (a Levelezés oldal naplója külön kulcson). */
const guestEmailsKey = (guestId: string) => ['mail', 'guest', guestId] as const;

// Levelek fül (TICKET-55): egyéni levél a vendégnek (egyedi szöveggel vagy sablonból) és a
// vendég levelezési előzményei. A recepció is küldhet; ez szolgáltatási levél, hozzájárulás
// nélkül is kimegy.
export const GuestEmails: React.FC<{ guest: GuestDto }> = ({ guest }) => {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState(NO_TEMPLATE);
  const [draft, setDraft] = useState<EmailDraft>(EMPTY_DRAFT);

  const messagesQuery = useQuery({
    queryKey: guestEmailsKey(guest.id),
    queryFn: () => api.getGuestEmailMessages(guest.id),
  });
  const templatesQuery = useQuery({
    queryKey: ['mail', 'templates'],
    queryFn: () => api.getEmailTemplates(),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      api.sendGuestEmail(guest.id, {
        subject: draft.subject,
        bodyHtml: draft.bodyHtml,
        templateId: templateId === NO_TEMPLATE ? null : templateId,
      }),
    onSuccess: (msg) => {
      notify.success('A levél a kimenő sorban.', `Címzett: ${msg.recipientEmail}`);
      setDraft(EMPTY_DRAFT);
      setTemplateId(NO_TEMPLATE);
      void queryClient.invalidateQueries({ queryKey: guestEmailsKey(guest.id) });
      void queryClient.invalidateQueries({ queryKey: ['mail', 'messages'] });
    },
  });

  const loadTemplate = (id: string) => {
    setTemplateId(id);
    const template = templatesQuery.data?.find((t) => t.id === id);
    if (template) setDraft({ subject: template.subject, bodyHtml: template.bodyHtml });
  };

  const messages = messagesQuery.data ?? [];
  const fullName = `${guest.lastName} ${guest.firstName}`;

  return (
    <div className="space-y-6">
      <section aria-labelledby="guest-emails-compose" className="space-y-4">
        <h3 id="guest-emails-compose" className="text-[13px] font-semibold text-foreground">
          Új levél
        </h3>
        {!guest.email ? (
          <Alert>
            <AlertDescription>
              A vendégnek nincs e-mail címe. Add meg az Áttekintés fülön, és utána írhatsz neki.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex max-w-md flex-col gap-1.5">
              <Label htmlFor="guest-email-template">Sablon</Label>
              <Select value={templateId} onValueChange={loadTemplate}>
                <SelectTrigger id="guest-email-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>Egyedi levél</SelectItem>
                  {(templatesQuery.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <EmailComposer
              idPrefix="guest-email"
              value={draft}
              onChange={setDraft}
              previewValues={placeholderValuesFor(guest)}
              previewNote={`${fullName} nevével, címzett: ${guest.email}`}
            />
            <div className="flex justify-end">
              <Button
                variant="primary"
                disabled={!draftHasContent(draft) || sendMutation.isPending}
                onClick={() => sendMutation.mutate()}
              >
                Levél küldése
              </Button>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="guest-emails-history" className="space-y-3">
        <h3 id="guest-emails-history" className="text-[13px] font-semibold text-foreground">
          Előzmények
        </h3>
        {messages.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {messagesQuery.isPending ? 'Betöltés…' : 'Még nem ment levél ennek a vendégnek.'}
          </p>
        ) : (
          <ul
            aria-label="A vendég levelei"
            className="divide-y divide-border rounded-md border border-border"
          >
            {messages.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{m.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {messageTypeLabel(m.messageType)}
                    {m.templateName ? ` · ${m.templateName}` : ''}
                    {m.createdByName ? ` · ${m.createdByName}` : ''} · {m.recipientEmail}
                  </p>
                  {m.errorDetails && <p className="text-xs text-destructive">{m.errorDetails}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDateTime(m.sentAt ?? m.createdAt)}
                  </span>
                  <EmailStatusBadge status={m.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
