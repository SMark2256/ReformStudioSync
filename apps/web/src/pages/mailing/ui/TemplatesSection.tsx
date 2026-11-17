import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EMAIL_TEMPLATE_NAME_MAX_LENGTH, EmailTemplateDto } from '@reform/shared';
import { Plus } from 'lucide-react';
import React, { useState } from 'react';
import { AUTOMATION_LABEL, formatMailDateTime, MAIL_QUERY_KEYS } from '@/entities/email';
import { draftHasContent, EmailComposer, EmailDraft } from '@/features/compose-email';
import { api } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmActionButton,
  Input,
  Label,
  ResponsiveTable,
  type ResponsiveTableColumn,
  Skeleton,
} from '@/shared/ui';

interface TemplateForm extends EmailDraft {
  id: string | null;
  name: string;
}

const NEW_TEMPLATE: TemplateForm = {
  id: null,
  name: '',
  subject: '',
  bodyHtml: '<p>Kedves {{keresztnev}}!</p><p></p><p>Üdvözlettel:<br>a {{studio_nev}} csapata</p>',
};

const COLUMNS: ResponsiveTableColumn<EmailTemplateDto>[] = [
  { key: 'name', header: 'Név', rowHeader: true, cell: (t) => t.name },
  { key: 'subject', header: 'Tárgy', cell: (t) => t.subject },
  {
    key: 'usedBy',
    header: 'Automatikus levél',
    cell: (t) =>
      t.usedByAutomations.length === 0 ? (
        <span className="text-muted-foreground">–</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {t.usedByAutomations.map((kind) => (
            <Badge key={kind} variant="secondary">
              {AUTOMATION_LABEL[kind]}
            </Badge>
          ))}
        </span>
      ),
  },
  {
    key: 'updatedAt',
    header: 'Módosítva',
    hideOnMobile: true,
    cell: (t) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {formatMailDateTime(t.updatedAt)}
        {t.updatedByName ? `, ${t.updatedByName}` : ''}
      </span>
    ),
  },
];

// Sablonok (TICKET-55): lista, és a kiválasztott vagy új sablon szerkesztése élő előnézettel.
// Szerkeszteni csak admin tud; a recepció a listát látja (az egyéni levélhez választ belőle).
export const TemplatesSection: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TemplateForm | null>(null);
  const templatesQuery = useQuery({
    queryKey: MAIL_QUERY_KEYS.templates,
    queryFn: () => api.getEmailTemplates(),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: MAIL_QUERY_KEYS.templates });
    void queryClient.invalidateQueries({ queryKey: MAIL_QUERY_KEYS.automations });
  };

  const saveMutation = useMutation({
    mutationFn: (f: TemplateForm) => {
      const data = { name: f.name.trim(), subject: f.subject, bodyHtml: f.bodyHtml };
      return f.id ? api.updateEmailTemplate(f.id, data) : api.createEmailTemplate(data);
    },
    onSuccess: (saved) => {
      notify.success(`„${saved.name}” sablon mentve.`);
      setForm(null);
      refresh();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteEmailTemplate(id),
    onSuccess: () => {
      notify.success('Sablon törölve.');
      setForm(null);
      refresh();
    },
  });

  const testMutation = useMutation({
    mutationFn: (draft: EmailDraft) =>
      api.sendTestEmail({ subject: draft.subject, bodyHtml: draft.bodyHtml }),
    onSuccess: (msg) => {
      notify.success('Tesztlevél a sorban.', `Címzett: ${msg.recipientEmail}`);
      void queryClient.invalidateQueries({ queryKey: MAIL_QUERY_KEYS.messages });
    },
  });

  if (form) {
    const canSave = form.name.trim().length > 0 && draftHasContent(form);
    const editing = templatesQuery.data?.find((t) => t.id === form.id);
    return (
      <Card>
        <CardHeader>
          <CardTitle>{form.id ? 'Sablon szerkesztése' : 'Új sablon'}</CardTitle>
          <CardActions>
            <Button variant="link" onClick={() => setForm(null)}>
              Vissza a sablonokhoz
            </Button>
          </CardActions>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-md flex-col gap-1.5">
            <Label htmlFor="template-name">Sablon neve</Label>
            <Input
              id="template-name"
              data-barcode-ignore
              value={form.name}
              maxLength={EMAIL_TEMPLATE_NAME_MAX_LENGTH}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <EmailComposer
            idPrefix="template"
            value={form}
            onChange={(draft) => setForm({ ...form, ...draft })}
          />
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          {form.id && (
            <ConfirmActionButton
              confirmLabel="Sablon törlése"
              description={
                editing && editing.usedByAutomations.length > 0
                  ? `A sablont ezek használják: ${editing.usedByAutomations
                      .map((k) => AUTOMATION_LABEL[k])
                      .join(', ')}. Törlés után kikapcsolnak, amíg nem választasz nekik új sablont.`
                  : 'A sablon véglegesen törlődik. A már elküldött levelek a naplóban maradnak.'
              }
              onConfirm={() => deleteMutation.mutate(form.id!)}
            >
              Törlés
            </ConfirmActionButton>
          )}
          <Button
            disabled={!draftHasContent(form) || testMutation.isPending}
            onClick={() => testMutation.mutate(form)}
          >
            Tesztlevél nekem
          </Button>
          <Button onClick={() => setForm(null)}>Mégse</Button>
          <Button
            variant="primary"
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate(form)}
          >
            Mentés
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sablonok</CardTitle>
        {isAdmin && (
          <CardActions>
            <Button onClick={() => setForm(NEW_TEMPLATE)}>
              <Plus aria-hidden strokeWidth={1.75} />
              Új sablon
            </Button>
          </CardActions>
        )}
      </CardHeader>
      {templatesQuery.isPending ? (
        <CardContent className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      ) : (
        <ResponsiveTable
          caption="E-mail-sablonok"
          columns={COLUMNS}
          rows={templatesQuery.data ?? []}
          getRowId={(t) => t.id}
          onRowOpen={
            isAdmin
              ? (t) => setForm({ id: t.id, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml })
              : undefined
          }
          emptyText="Még nincs sablon. Készíts egyet az Új sablon gombbal."
        />
      )}
    </Card>
  );
};
