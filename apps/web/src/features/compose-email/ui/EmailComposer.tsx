import { EMAIL_SUBJECT_MAX_LENGTH, EmailPlaceholderValues } from '@reform/shared';
import React, { useDeferredValue } from 'react';
import { Alert, AlertDescription, Input, Label } from '@/shared/ui';
import { EmailDraft, renderDraftPreview, unknownPlaceholdersIn } from '../model/emailDraft';
import { EmailEditor } from './EmailEditor';

interface EmailComposerProps {
  /** Egyedi előtag a mezők `id`-jához (egy oldalon több szerkesztő is lehet). */
  idPrefix: string;
  value: EmailDraft;
  onChange: (next: EmailDraft) => void;
  /** Marketing levél: az előnézet láblécében leiratkozó link. */
  marketing?: boolean;
  /** Az előnézet mezőértékei (alapból mintavendég). */
  previewValues?: EmailPlaceholderValues;
  /** Kinek a nevével látszik az előnézet. */
  previewNote?: string;
}

// Levél írása (TICKET-55): tárgy, szerkesztő és mellette az élő előnézet a teljes levélkerettel.
export const EmailComposer: React.FC<EmailComposerProps> = ({
  idPrefix,
  value,
  onChange,
  marketing = false,
  previewValues,
  previewNote = 'Mintavendéggel (Kovács Anna).',
}) => {
  const deferred = useDeferredValue(value);
  const preview = renderDraftPreview(deferred, { values: previewValues, marketing });
  const unknown = unknownPlaceholdersIn(deferred);
  const subjectId = `${idPrefix}-subject`;
  const bodyLabelId = `${idPrefix}-body-label`;

  return (
    <div
      data-barcode-ignore
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6"
    >
      <div className="min-w-0 space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={subjectId}>Tárgy</Label>
          <Input
            id={subjectId}
            value={value.subject}
            maxLength={EMAIL_SUBJECT_MAX_LENGTH}
            onChange={(e) => onChange({ ...value, subject: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id={bodyLabelId} htmlFor={`${idPrefix}-body`}>
            Szöveg
          </Label>
          <EmailEditor
            id={`${idPrefix}-body`}
            labelledBy={bodyLabelId}
            value={value.bodyHtml}
            onChange={(bodyHtml) => onChange({ ...value, bodyHtml })}
          />
        </div>
        {unknown.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              Ismeretlen mező: {unknown.map((k) => `{{${k}}}`).join(', ')}. Javítsd, vagy szúrd be
              a mezőt a listából.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <section aria-labelledby={`${idPrefix}-preview-title`} className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3
            id={`${idPrefix}-preview-title`}
            className="text-xs font-semibold text-muted-foreground"
          >
            Előnézet
          </h3>
          <p className="text-xs text-muted-foreground">{previewNote}</p>
        </div>
        <p className="truncate text-sm">
          <span className="text-muted-foreground">Tárgy: </span>
          <span className="font-medium text-foreground" data-testid="email-preview-subject">
            {preview.subject || '(nincs tárgy)'}
          </span>
        </p>
        {/* A levél saját, világos kerettel készül (e-mail kliensek); a szkriptek tiltva. */}
        <iframe
          title="A levél előnézete"
          sandbox=""
          srcDoc={preview.html}
          className="h-[460px] w-full rounded-md border border-border bg-white"
        />
      </section>
    </div>
  );
};
