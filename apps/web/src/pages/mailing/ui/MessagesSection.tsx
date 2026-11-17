import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmailMessageListQueryDto, MessageLogDto, MessageStatus } from '@reform/shared';
import React, { useDeferredValue, useState } from 'react';
import {
  EmailStatusBadge,
  formatMailDateTime,
  MAIL_QUERY_KEYS,
  MESSAGE_STATUS_LABEL,
  MESSAGE_TYPE_OPTIONS,
  messageTypeLabel,
} from '@/entities/email';
import { api } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ResponsiveTable,
  type ResponsiveTableColumn,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

const PAGE_SIZE = 50;
/** Az API egy lekérésben legfeljebb ennyit ad; a régebbiekhez szűkíteni kell. */
const MAX_LIMIT = 200;
const ALL = '__all__';

// Elküldött e-mailek (TICKET-55): a kimenő sor és a régi napló, szűrhetően. Hibás levél
// újraküldhető; a várakozó a következő próbálkozás idejét mutatja.
export const MessagesSection: React.FC = () => {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [messageType, setMessageType] = useState<string>(ALL);
  const [templateId, setTemplateId] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const deferredQ = useDeferredValue(q.trim());

  const query: EmailMessageListQueryDto = {
    q: deferredQ || undefined,
    status: status === ALL ? undefined : (status as MessageStatus),
    messageType: messageType === ALL ? undefined : messageType,
    templateId: templateId === ALL ? undefined : templateId,
    from: from || undefined,
    to: to || undefined,
    limit,
  };

  const statusQuery = useQuery({ queryKey: MAIL_QUERY_KEYS.status, queryFn: () => api.getMailStatus() });
  const templatesQuery = useQuery({
    queryKey: MAIL_QUERY_KEYS.templates,
    queryFn: () => api.getEmailTemplates(),
  });
  const messagesQuery = useQuery({
    queryKey: [...MAIL_QUERY_KEYS.messages, query],
    queryFn: () => api.getEmailMessages(query),
    placeholderData: keepPreviousData,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.retryEmailMessage(id),
    onSuccess: (msg) => {
      notify.success('A levél újra a sorban.', msg.recipientEmail);
      void queryClient.invalidateQueries({ queryKey: MAIL_QUERY_KEYS.messages });
      void queryClient.invalidateQueries({ queryKey: MAIL_QUERY_KEYS.status });
    },
  });

  const columns: ResponsiveTableColumn<MessageLogDto>[] = [
    {
      key: 'recipient',
      header: 'Címzett',
      rowHeader: true,
      cell: (m) => (
        <span className="block min-w-0">
          <span className="block font-medium text-foreground">
            {m.recipientName ?? m.guestName ?? m.recipientEmail}
          </span>
          <span className="block text-xs text-muted-foreground">{m.recipientEmail}</span>
        </span>
      ),
    },
    { key: 'subject', header: 'Tárgy', cell: (m) => m.subject },
    {
      key: 'type',
      header: 'Típus',
      cell: (m) => (
        <span className="block">
          {messageTypeLabel(m.messageType)}
          {m.templateName && (
            <span className="block text-xs text-muted-foreground">Sablon: {m.templateName}</span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Állapot',
      cell: (m) => (
        <span className="block space-y-1">
          <EmailStatusBadge status={m.status} />
          {m.status === MessageStatus.PENDING && m.nextAttemptAt && (
            <span className="block text-xs text-muted-foreground">
              Következő próba: {formatMailDateTime(m.nextAttemptAt)}
            </span>
          )}
          {m.errorDetails && (
            <span className="block text-xs text-destructive">{m.errorDetails}</span>
          )}
        </span>
      ),
    },
    {
      key: 'time',
      header: 'Idő',
      cell: (m) => (
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {formatMailDateTime(m.sentAt ?? m.createdAt)}
          {(m.attempts ?? 0) > 1 ? ` · ${m.attempts}. próba` : ''}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Művelet',
      srOnlyHeader: true,
      align: 'right',
      cell: (m) =>
        m.status === MessageStatus.FAILED ? (
          <Button
            variant="link"
            aria-label={`Újraküldés: ${m.recipientEmail}, ${m.subject}`}
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate(m.id)}
          >
            Újraküldés
          </Button>
        ) : null,
    },
  ];

  const mailStatus = statusQuery.data;
  const total = messagesQuery.data?.total ?? 0;
  const items = messagesQuery.data?.items ?? [];

  return (
    <div className="space-y-4 md:space-y-6">
      {mailStatus && !mailStatus.configured && (
        <Alert variant="destructive">
          <AlertDescription>
            A levélküldés nincs beállítva (SendPulse kulcs), a levelek a sorban várakoznak.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Elküldött e-mailek</CardTitle>
          {mailStatus && (
            <p className="text-xs text-muted-foreground" data-testid="mail-status">
              Az elmúlt órában {mailStatus.sentLastHour} / {mailStatus.hourlyLimit} levél · várakozik:{' '}
              {mailStatus.pendingCount} · hibás: {mailStatus.failedCount}
            </p>
          )}
        </CardHeader>
        <div className="grid gap-3 border-b border-border px-4 py-4 sm:grid-cols-2 md:px-5 xl:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mail-search">Keresés</Label>
            <SearchInput
              id="mail-search"
              className="md:w-full xl:w-full"
              data-barcode-ignore
              placeholder="Címzett vagy tárgy"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mail-status-filter">Állapot</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="mail-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Mind</SelectItem>
                {Object.values(MessageStatus).map((s) => (
                  <SelectItem key={s} value={s}>
                    {MESSAGE_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mail-type-filter">Típus</Label>
            <Select value={messageType} onValueChange={setMessageType}>
              <SelectTrigger id="mail-type-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Mind</SelectItem>
                {MESSAGE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mail-template-filter">Sablon</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="mail-template-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Mind</SelectItem>
                {(templatesQuery.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mail-from">Ettől</Label>
            <Input id="mail-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mail-to">Eddig</Label>
            <Input id="mail-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <ResponsiveTable
          caption="Elküldött e-mailek"
          columns={columns}
          rows={items}
          getRowId={(m) => m.id}
          emptyText={
            messagesQuery.isPending ? 'Betöltés…' : 'Nincs a szűrőnek megfelelő levél.'
          }
        />
        <div
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground md:px-5"
        >
          <span>
            {items.length} / {total} levél
          </span>
          {items.length < total && limit < MAX_LIMIT && (
            <Button size="sm" onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_LIMIT))}>
              Továbbiak
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};
