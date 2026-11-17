import {
  INTAKE_LEGAL_REVIEW_LABEL,
  IntakeAnswers,
  IntakeAnswerSet,
  IntakeAnswerValue,
  IntakeFormDefinitionDto,
  IntakeGuestExitResponseDto,
  intakeWarnings,
  isIntakeEditableByGuest,
  isQuestionVisible,
  missingRequiredAnswers,
  toAppError,
} from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, LogOut } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ThemeToggleButton } from '@/features/toggle-theme';
import { api } from '@/shared/api';
import { optimizeImageFile } from '@/shared/lib/image';
import { notify } from '@/shared/lib/notify';
import { Badge, Button, Progress, Skeleton } from '@/shared/ui';
import {
  buildIntakeSteps,
  firstIncompleteStepIndex,
  signedDocumentTitles,
} from '../model/intakeSteps';
import { ExitGuestModeDialog } from './ExitGuestModeDialog';
import { QuestionField } from './QuestionField';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

const GUEST_VIEW_KEY = (token: string) => ['intake', 'guest-view', token] as const;

/**
 * A tablet vendégmódja (TICKET-56): a vendég lépésenként kitölti a kérdőíveket, profilképet
 * készít, végül egyszer aláírja az összes dokumentumot. Csak a saját kitöltését látja.
 */
export const GuestIntakeFlow: React.FC<{
  guestToken: string;
  onExited: (result: IntakeGuestExitResponseDto) => void;
  onTokenInvalid: () => void;
}> = ({ guestToken, onExited, onTokenInvalid }) => {
  const queryClient = useQueryClient();
  const [exitOpen, setExitOpen] = useState(false);
  const viewQuery = useQuery({
    queryKey: GUEST_VIEW_KEY(guestToken),
    queryFn: () => api.getIntakeGuestView(guestToken),
    retry: false,
  });

  useEffect(() => {
    if (viewQuery.error && toAppError(viewQuery.error).code === 'INTAKE.GUEST_TOKEN_INVALID') {
      onTokenInvalid();
    }
  }, [viewQuery.error, onTokenInvalid]);

  const view = viewQuery.data;
  const done = view ? !isIntakeEditableByGuest(view.status) : false;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-base font-semibold">Re-Form Stúdió · Vendégfelvétel</p>
            {view && (
              <p className="text-xs text-muted-foreground">{view.packageLabels.join(', ')}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggleButton />
            <Button type="button" size="sm" onClick={() => setExitOpen(true)}>
              <LogOut aria-hidden className="size-4" />
              Kilépés (munkatárs)
            </Button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 focus:outline-none">
        {!view ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : done ? (
          <ThankYou />
        ) : (
          <IntakeSteps
            guestToken={guestToken}
            forms={view.forms}
            initialAnswers={view.answers}
            hasProfilePhoto={view.hasProfilePhoto}
            onSubmitted={(next) => queryClient.setQueryData(GUEST_VIEW_KEY(guestToken), next)}
            onTokenInvalid={onTokenInvalid}
          />
        )}
      </main>

      <ExitGuestModeDialog
        guestToken={guestToken}
        open={exitOpen}
        onOpenChange={setExitOpen}
        onExited={(result) => {
          setExitOpen(false);
          onExited(result);
        }}
      />
    </div>
  );
};

const ThankYou: React.FC = () => (
  <section className="space-y-3 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
    <CheckCircle2 aria-hidden className="mx-auto size-10 text-success" />
    <h1 className="text-xl font-semibold">Köszönjük, minden adatot megkaptunk</h1>
    <p className="text-sm text-muted-foreground">
      Kérjük, add vissza a tabletet a recepciónak. A munkatárs ellenőrzi az adataidat.
    </p>
  </section>
);

const IntakeSteps: React.FC<{
  guestToken: string;
  forms: IntakeFormDefinitionDto[];
  initialAnswers: IntakeAnswerSet;
  hasProfilePhoto: boolean;
  onSubmitted: (view: Awaited<ReturnType<typeof api.submitIntakeGuest>>) => void;
  onTokenInvalid: () => void;
}> = ({ guestToken, forms, initialAnswers, hasProfilePhoto, onSubmitted, onTokenInvalid }) => {
  const steps = useMemo(() => buildIntakeSteps(forms), [forms]);
  const [answers, setAnswers] = useState<IntakeAnswerSet>(initialAnswers);
  const [stepIndex, setStepIndex] = useState(() => firstIncompleteStepIndex(steps, initialAnswers));
  const [showErrors, setShowErrors] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const signatureRef = useRef<SignaturePadHandle | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const step = steps[stepIndex];
  const handleError = (error: unknown) => {
    if (toAppError(error).code === 'INTAKE.GUEST_TOKEN_INVALID') onTokenInvalid();
  };

  // Lépésváltáskor a fókusz az új lépés címére kerül (képernyőolvasó, billentyűzet).
  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [stepIndex]);

  const goTo = (index: number) => {
    setShowErrors(false);
    setStepIndex(Math.max(0, Math.min(steps.length - 1, index)));
  };

  const saveMutation = useMutation({
    mutationFn: (form: IntakeFormDefinitionDto) =>
      api.saveIntakeGuestAnswers(guestToken, form.key, answers[form.key] ?? {}),
    onSuccess: () => goTo(stepIndex + 1),
    onError: handleError,
  });

  const photoMutation = useMutation({
    mutationFn: (dataUrl: string) => api.saveIntakeGuestPhoto(guestToken, dataUrl),
    onSuccess: () => goTo(stepIndex + 1),
    onError: handleError,
  });

  const submitMutation = useMutation({
    mutationFn: (signatureDataUrl: string) => api.submitIntakeGuest(guestToken, signatureDataUrl),
    onSuccess: (view) => {
      notify.success('Köszönjük, az aláírt dokumentumokat megkaptuk.');
      onSubmitted(view);
    },
    onError: (error) => {
      handleError(error);
      // Hiányos válasz: az első hiányos lépésre visz.
      if (toAppError(error).code === 'INTAKE.ANSWERS_INCOMPLETE') {
        goTo(firstIncompleteStepIndex(steps, answers));
        setShowErrors(true);
      }
    },
  });

  const setAnswer = (formKey: string, questionId: string, value: IntakeAnswerValue) =>
    setAnswers((current) => ({
      ...current,
      [formKey]: { ...(current[formKey] ?? {}), [questionId]: value },
    }));

  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);
  const busy = saveMutation.isPending || photoMutation.isPending || submitMutation.isPending;

  let content: React.ReactNode;
  let next: () => void;
  let nextLabel = 'Tovább';

  if (step.kind === 'form') {
    const form = step.form;
    const formAnswers: IntakeAnswers = answers[form.key] ?? {};
    const missing = missingRequiredAnswers(form, formAnswers);
    const warnings = new Map(intakeWarnings(form, formAnswers).map((w) => [w.questionId, w.text]));
    next = () => {
      if (missing.length > 0) {
        setShowErrors(true);
        return;
      }
      saveMutation.mutate(form);
    };
    content = (
      <>
        <StepHeading ref={headingRef} title={form.title} legalReviewPending={form.legalReviewPending} />
        <div className="max-h-[40dvh] overflow-y-auto whitespace-pre-line rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
          {form.bodyText}
        </div>
        <div className="space-y-6">
          {form.questions
            .filter((q) => isQuestionVisible(q, formAnswers))
            .map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={formAnswers[question.id]}
                onChange={(value) => setAnswer(form.key, question.id, value)}
                warning={warnings.get(question.id)}
                invalid={showErrors && missing.includes(question.id)}
              />
            ))}
        </div>
      </>
    );
  } else if (step.kind === 'photo') {
    next = () => (photo ? photoMutation.mutate(photo) : goTo(stepIndex + 1));
    nextLabel = photo ? 'Tovább' : 'Kihagyás';
    content = (
      <>
        <StepHeading ref={headingRef} title="Profilkép" />
        <p className="text-sm text-muted-foreground">
          A képet csak a recepció látja, a belépéskor azonosításra. Nem marketingcélú; arról a
          végén külön döntesz.
        </p>
        <PhotoPicker value={photo} hasExisting={hasProfilePhoto} onChange={setPhoto} />
      </>
    );
  } else {
    next = () => {
      const signature = signatureRef.current?.toDataUrl();
      if (signature) submitMutation.mutate(signature);
    };
    nextLabel = 'Aláírás és beküldés';
    content = (
      <>
        <StepHeading ref={headingRef} title="Aláírás" />
        <p className="text-sm text-muted-foreground">
          Az aláírásoddal az alábbi dokumentumokat fogadod el, a megadott válaszokkal:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {signedDocumentTitles(forms).map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
        <SignaturePad ref={signatureRef} label="Aláírás" onChange={setHasSignature} />
      </>
    );
  }

  return (
    <section aria-labelledby="intake-step-title" className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {stepIndex + 1}. lépés a {steps.length}-ből
        </p>
        <Progress value={progress} aria-label="Kitöltés állapota" />
      </div>
      <div className="space-y-6 rounded-lg border border-border bg-card p-5 shadow-sm md:p-6">
        {content}
      </div>
      <div className="flex flex-wrap justify-between gap-3">
        <Button type="button" disabled={stepIndex === 0 || busy} onClick={() => goTo(stepIndex - 1)}>
          Vissza
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={busy || (step.kind === 'sign' && !hasSignature)}
          onClick={next}
        >
          {nextLabel}
        </Button>
      </div>
    </section>
  );
};

const StepHeading = React.forwardRef<
  HTMLHeadingElement,
  { title: string; legalReviewPending?: boolean }
>(({ title, legalReviewPending }, ref) => (
  <div className="flex flex-wrap items-center gap-2">
    <h1 ref={ref} id="intake-step-title" tabIndex={-1} className="text-xl font-semibold focus:outline-none">
      {title}
    </h1>
    {legalReviewPending && <Badge variant="warning">{INTAKE_LEGAL_REVIEW_LABEL}</Badge>}
  </div>
));
StepHeading.displayName = 'StepHeading';

const PhotoPicker: React.FC<{
  value: string | null;
  hasExisting: boolean;
  onChange: (dataUrl: string | null) => void;
}> = ({ value, hasExisting, onChange }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await optimizeImageFile(file, { maxDimensionPx: 640, quality: 0.8 });
      onChange(result.dataUrl);
    } catch {
      notify.error('A kép nem olvasható', 'Készíts új képet, vagy hagyd ki ezt a lépést.');
    }
  };
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <div className="flex size-40 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
        {value ? (
          <img src={value} alt="Az elkészült profilkép" className="size-full object-cover" />
        ) : (
          <Camera aria-hidden className="size-10 text-muted-foreground" />
        )}
      </div>
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          aria-label="Profilkép készítése vagy kiválasztása"
          data-testid="intake-photo-input"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <Button type="button" onClick={() => inputRef.current?.click()}>
          <Camera aria-hidden className="size-4" />
          {value ? 'Új kép készítése' : 'Kép készítése'}
        </Button>
        {hasExisting && !value && (
          <p className="text-xs text-muted-foreground">Profilképed már van; csak cseréhez kell újat készíteni.</p>
        )}
      </div>
    </div>
  );
};

