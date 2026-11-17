import { IntakeAnswerValue, IntakeQuestion } from '@reform/shared';
import { AlertTriangle } from 'lucide-react';
import React, { useId } from 'react';
import { Checkbox, Input, Label, RadioGroup, RadioGroupItem } from '@/shared/ui';

const INPUT_TYPES: Partial<Record<IntakeQuestion['type'], string>> = {
  TEXT: 'text',
  EMAIL: 'email',
  PHONE: 'tel',
  DATE: 'date',
};

const AUTOCOMPLETE: Partial<Record<string, string>> = {
  lastName: 'family-name',
  firstName: 'given-name',
  birthDate: 'bday',
  phone: 'tel',
  email: 'email',
};

// Érintőre méretezett választó: a teljes sor kattintható, legalább 44 px magas.
const choiceRowClassName =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input bg-card px-3 py-2 text-base text-foreground has-[[data-state=checked]]:border-primary';

/**
 * Egy kérdőív-kérdés a tableten. A figyelmeztetés csak kockázatot jelző válasznál, közvetlenül
 * a kérdés alatt jelenik meg (a szövegét a kérdőív-definíció adja).
 */
export const QuestionField: React.FC<{
  question: IntakeQuestion;
  value: IntakeAnswerValue | undefined;
  onChange: (value: IntakeAnswerValue) => void;
  warning?: string;
  invalid?: boolean;
}> = ({ question, value, onChange, warning, invalid }) => {
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const describedBy = invalid ? errorId : undefined;
  const label = (
    <>
      {question.label}
      {question.required && <span aria-hidden> *</span>}
    </>
  );

  let control: React.ReactNode;
  if (question.type === 'ACCEPT') {
    control = (
      <label className={choiceRowClassName}>
        <Checkbox
          checked={value === 'ACCEPTED'}
          onCheckedChange={(checked) => onChange(checked === true ? 'ACCEPTED' : '')}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        />
        <span>{label}</span>
      </label>
    );
  } else if (question.type === 'MULTI_CHOICE') {
    const selected = Array.isArray(value) ? value : [];
    control = (
      <div role="group" aria-labelledby={labelId} aria-describedby={describedBy} className="grid gap-2 sm:grid-cols-2">
        {(question.options ?? []).map((option) => (
          <label key={option.value} className={choiceRowClassName}>
            <Checkbox
              checked={selected.includes(option.value)}
              onCheckedChange={(checked) =>
                onChange(
                  checked === true
                    ? [...selected, option.value]
                    : selected.filter((v) => v !== option.value),
                )
              }
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    );
  } else if (question.type === 'YES_NO' || question.type === 'SINGLE_CHOICE') {
    control = (
      <RadioGroup
        value={typeof value === 'string' ? value : ''}
        onValueChange={onChange}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={question.type === 'YES_NO' ? 'grid-cols-2' : 'sm:grid-cols-2'}
      >
        {(question.options ?? []).map((option) => (
          <label key={option.value} className={choiceRowClassName}>
            <RadioGroupItem value={option.value} />
            <span>{option.label}</span>
          </label>
        ))}
      </RadioGroup>
    );
  } else {
    control = (
      <Input
        id={id}
        type={INPUT_TYPES[question.type] ?? 'text'}
        autoComplete={AUTOCOMPLETE[question.profileField ?? ''] ?? 'off'}
        data-barcode-ignore
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="coarse:text-base"
      />
    );
  }

  return (
    <div className="space-y-2">
      {question.type !== 'ACCEPT' &&
        (INPUT_TYPES[question.type] ? (
          <Label htmlFor={id} id={labelId}>
            {label}
          </Label>
        ) : (
          <p id={labelId} className="text-sm font-semibold text-foreground">
            {label}
          </p>
        ))}
      {question.help && <p className="text-xs text-muted-foreground">{question.help}</p>}
      {control}
      {invalid && (
        <p id={errorId} className="text-xs text-destructive">
          A kérdés megválaszolása kötelező.
        </p>
      )}
      {warning && (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-sm text-foreground"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>{warning}</span>
        </div>
      )}
    </div>
  );
};
