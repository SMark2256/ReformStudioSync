import {
  Gender,
  INTAKE_DUPLICATE_REASON_LABELS,
  INTAKE_LEGAL_REVIEW_LABEL,
  INTAKE_MEASUREMENT_FIELDS,
  IntakeHealthDto,
  IntakeMeasurementDraft,
  IntakeProfileDraft,
  IntakeSessionDetailDto,
  IntakeStatus,
  isHealthForm,
  isIntakeEditableByGuest,
  isIntakeOpen,
  isQuestionVisible,
} from '@reform/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDisplayDevices } from '@/entities/display-device';
import { INTAKE_QUERY_KEYS, IntakeDocumentsList, IntakeStatusBadge } from '@/entities/intake';
import { api, type IntakeSessionAction } from '@/shared/api';
import { useAuthStore, useIntakeGuestStore } from '@/shared/auth';
import { TABLET_INTAKE_PATH } from '@/shared/config';
import { notify } from '@/shared/lib/notify';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmActionButton,
  DataList,
  DataListItem,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';
import { answerText } from '../model/answerText';

const GENDER_LABELS: Record<Gender, string> = {
  [Gender.FEMALE]: 'Nő',
  [Gender.MALE]: 'Férfi',
  [Gender.UNSPECIFIED]: 'Nem adta meg',
};

const formatDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

type Handover =
  | { kind: 'this-device'; sessionId: string; guestToken: string; expiresAt: string; exitCode: string }
  | { kind: 'tablet'; deviceName: string; exitCode: string };

const Section: React.FC<{ title: string; children: React.ReactNode; actions?: React.ReactNode }> = ({
  title,
  children,
  actions,
}) => (
  <section className="space-y-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {actions}
    </div>
    {children}
  </section>
);

/**
 * Ellenőrző-jóváhagyó nézet (TICKET-56): átadás a vendégnek (ezen az eszközön vagy párosított
 * tabletre), a kitöltött adatok ellenőrzése és javítása, mérések, egészségügyi válaszok
 * (külön, naplózott megnyitással), majd jóváhagyás. Lezárás után az aláírt PDF-ek.
 */
export const IntakeReviewPanel: React.FC<{ session: IntakeSessionDetailDto }> = ({ session }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [handover, setHandover] = useState<Handover | null>(null);
  const [health, setHealth] = useState<IntakeHealthDto | null>(null);

  useEffect(() => setHealth(null), [session.id]);

  const refresh = (detail?: IntakeSessionDetailDto) => {
    if (detail) queryClient.setQueryData(INTAKE_QUERY_KEYS.session(detail.id), detail);
    void queryClient.invalidateQueries({ queryKey: INTAKE_QUERY_KEYS.all });
  };

  const actionMutation = useMutation({
    mutationFn: (action: IntakeSessionAction) => api.intakeSessionAction(session.id, action),
    onSuccess: (detail, action) => {
      refresh(detail);
      if (action === 'approve' || action === 'retry') {
        if (detail.status === IntakeStatus.COMPLETED) {
          notify.success('Jóváhagyva', 'A vendégprofil frissült, az aláírt PDF-ek elkészültek.');
          if (detail.guestId) {
            void queryClient.invalidateQueries({ queryKey: INTAKE_QUERY_KEYS.guestDocuments(detail.guestId) });
            void queryClient.invalidateQueries({ queryKey: ['guests'] });
          }
        } else if (detail.status === IntakeStatus.FAILED) {
          notify.warning('A PDF-ek nem készültek el', detail.failureReason ?? 'Próbáld újra a lezárást.');
        }
      }
    },
  });

  const guestModeMutation = useMutation({
    mutationFn: () => api.startIntakeGuestMode(session.id),
    onSuccess: (result) => setHandover({ kind: 'this-device', ...result }),
  });

  const healthMutation = useMutation({
    mutationFn: () => api.getIntakeHealth(session.id),
    onSuccess: setHealth,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.updateIntakeSession>[1]) =>
      api.updateIntakeSession(session.id, data),
    onSuccess: (detail) => {
      refresh(detail);
      notify.success('Mentve');
    },
  });

  const handOverToGuest = () => {
    if (handover?.kind !== 'this-device') return;
    // Vendégmód ezen az eszközön: a munkatársi munkamenet megszűnik, kilépni csak a kóddal lehet.
    useAuthStore.getState().logout();
    useIntakeGuestStore.getState().start(handover);
    navigate(TABLET_INTAKE_PATH);
  };

  const status = session.status;
  const busy = actionMutation.isPending;
  const generalForms = session.forms.filter((f) => !isHealthForm(f.kind) && f.kind !== 'PROFILE');
  const healthForms = session.forms.filter((f) => isHealthForm(f.kind));

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle>{session.guestName}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {session.packageLabels.join(', ')} · előkészítette: {session.createdByName},{' '}
            {formatDateTime(session.createdAt)}
          </p>
        </div>
        <IntakeStatusBadge status={status} />
      </CardHeader>
      <CardContent className="space-y-5">
        {isIntakeEditableByGuest(status) && (
          <Section title="Átadás a vendégnek">
            <HandoverControls
              session={session}
              busy={guestModeMutation.isPending}
              onThisDevice={() => guestModeMutation.mutate()}
              onSent={(deviceName, exitCode) => {
                setHandover({ kind: 'tablet', deviceName, exitCode });
                refresh();
              }}
              onRelease={() => actionMutation.mutate('release')}
            />
          </Section>
        )}

        {!session.guestId && session.duplicates.length > 0 && (
          <Section title="Lehetséges duplikátum">
            <div role="alert" className="space-y-2 rounded-md border border-warning/35 bg-warning/10 p-3 text-sm">
              {session.duplicates.map((candidate) => {
                const linked = session.linkGuestId === candidate.guestId;
                return (
                  <div key={candidate.guestId} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-foreground">
                      {candidate.name} ({candidate.barcode}) – egyezés:{' '}
                      {candidate.matchedOn.map((r) => INTAKE_DUPLICATE_REASON_LABELS[r]).join(', ')}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!isIntakeOpen(status) || updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ linkGuestId: linked ? null : candidate.guestId })}
                    >
                      {linked ? 'Mégis új vendég' : 'Ehhez a vendéghez'}
                    </Button>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                {session.linkGuestId
                  ? 'Jóváhagyáskor a kiválasztott meglévő vendég profilja frissül.'
                  : 'Jóváhagyáskor új vendég jön létre.'}
              </p>
            </div>
          </Section>
        )}

        {isIntakeOpen(status) ? (
          <ProfileEditor
            key={`${session.id}-${session.updatedAt}`}
            profile={session.profile}
            busy={updateMutation.isPending}
            onSave={(profile) => updateMutation.mutate({ profile })}
          />
        ) : (
          <Section title="Személyes adatok">
            <DataList>
              <DataListItem label="Név">{session.guestName}</DataListItem>
              <DataListItem label="Születési dátum">{session.profile.birthDate || '—'}</DataListItem>
              <DataListItem label="Telefon">{session.profile.phone || '—'}</DataListItem>
              <DataListItem label="E-mail">{session.profile.email || '—'}</DataListItem>
            </DataList>
          </Section>
        )}

        <MeasurementsEditor
          key={`m-${session.id}-${session.updatedAt}`}
          measurements={session.measurements}
          editable={isIntakeOpen(status)}
          busy={updateMutation.isPending}
          onSave={(measurements) => updateMutation.mutate({ measurements })}
        />

        {generalForms.map((form) => (
          <Section key={form.key} title={`${form.title} (v${form.version})`}>
            {form.legalReviewPending && <Badge variant="warning">{INTAKE_LEGAL_REVIEW_LABEL}</Badge>}
            <DataList>
              {form.questions
                .filter((q) => isQuestionVisible(q, session.answers[form.key] ?? {}))
                .map((q) => (
                  <DataListItem key={q.id} label={q.label}>
                    {answerText(q, session.answers[form.key]?.[q.id])}
                  </DataListItem>
                ))}
            </DataList>
          </Section>
        ))}

        {healthForms.length > 0 && (
          <Section
            title="Egészségügyi válaszok"
            actions={
              !health && (
                <Button type="button" size="sm" disabled={healthMutation.isPending} onClick={() => healthMutation.mutate()}>
                  Megtekintés (naplózva)
                </Button>
              )
            }
          >
            {!health ? (
              <p className="text-xs text-muted-foreground">
                Különleges adat: csak szükség esetén nyisd meg, minden megtekintés az auditnaplóba kerül.
              </p>
            ) : (
              <div className="space-y-4">
                {health.warnings.length > 0 && (
                  <div role="alert" className="flex gap-2 rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-sm text-foreground">
                    <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                    <span>{health.warnings.length} kockázatot jelző válasz – beszéld át a vendéggel.</span>
                  </div>
                )}
                {healthForms.map((form) => {
                  const answers = health.answers[form.key] ?? {};
                  const flagged = new Set(
                    health.warnings.filter((w) => w.formKey === form.key).map((w) => w.questionId),
                  );
                  return (
                    <div key={form.key} className="space-y-2">
                      <p className="text-sm font-medium text-foreground">{form.title}</p>
                      <DataList>
                        {form.questions
                          .filter((q) => isQuestionVisible(q, answers))
                          .map((q) => (
                            <DataListItem key={q.id} label={q.label}>
                              <span className={flagged.has(q.id) ? 'text-warning' : undefined}>
                                {answerText(q, answers[q.id])}
                                {flagged.has(q.id) && ' (figyelmeztetés)'}
                              </span>
                            </DataListItem>
                          ))}
                      </DataList>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        )}

        {(session.profilePhotoDataUrl || session.signatureDataUrl) && (
          <Section title="Profilkép és aláírás">
            <div className="flex flex-wrap items-end gap-4">
              {session.profilePhotoDataUrl && (
                <img
                  src={session.profilePhotoDataUrl}
                  alt="Belső azonosító profilkép"
                  className="size-28 rounded-md border border-border object-cover"
                />
              )}
              {session.signatureDataUrl && (
                <figure className="space-y-1">
                  {/* Sötét tinta fehér lapon: mindkét témában olvasható. */}
                  <img
                    src={session.signatureDataUrl}
                    alt="A vendég aláírása"
                    style={{ backgroundColor: '#ffffff' }}
                    className="h-20 rounded-md border border-border px-2"
                  />
                  <figcaption className="text-xs text-muted-foreground">
                    Aláírva: {formatDateTime(session.signedAt)}
                  </figcaption>
                </figure>
              )}
            </div>
          </Section>
        )}

        {session.snapshots.length > 0 && (
          <Section title="Aláírt dokumentumok">
            <IntakeDocumentsList documents={session.snapshots} />
          </Section>
        )}

        {status === IntakeStatus.FAILED && (
          <div role="alert" className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            A lezárás nem sikerült: {session.failureReason ?? 'ismeretlen hiba'}. A vendégprofil már
            frissült; a PDF-ek elkészítése újrapróbálható.
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-5">
          {isIntakeOpen(status) && (
            <ConfirmActionButton
              confirmLabel="Vendégfelvétel megszakítása"
              description="A vendég kitöltése elvész, a tablet vendégmódja lezárul."
              disabled={busy}
              onConfirm={() => actionMutation.mutate('cancel')}
            >
              Megszakítás
            </ConfirmActionButton>
          )}
          {status === IntakeStatus.AWAITING_REVIEW && (
            <>
              <Button type="button" disabled={busy} onClick={() => actionMutation.mutate('return')}>
                Visszaküldés javításra
              </Button>
              <Button type="button" variant="primary" disabled={busy} onClick={() => actionMutation.mutate('approve')}>
                Jóváhagyás
              </Button>
            </>
          )}
          {status === IntakeStatus.FAILED && (
            <Button type="button" variant="primary" disabled={busy} onClick={() => actionMutation.mutate('retry')}>
              Lezárás újrapróbálása
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={handover !== null} onOpenChange={(open) => !open && setHandover(null)}>
        <DialogContent size="form">
          <DialogHeader>
            <DialogTitle>Kilépési kód</DialogTitle>
            <DialogDescription>
              {handover?.kind === 'tablet'
                ? `A kitöltés megjelent a(z) ${handover.deviceName} tableten. A vendégmódból ezzel a kóddal lehet kilépni.`
                : 'Jegyezd meg: a vendégmódból csak ezzel a kóddal léphetsz ki, és utána újra munkatársként dolgozhatsz.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-center text-3xl font-semibold tabular-nums tracking-widest text-foreground" data-testid="intake-exit-code">
              {handover?.exitCode}
            </p>
          </DialogBody>
          <DialogFooter>
            {handover?.kind === 'this-device' ? (
              <>
                <Button type="button" onClick={() => setHandover(null)}>
                  Mégse
                </Button>
                <Button type="button" variant="primary" onClick={handOverToGuest}>
                  Átadás a vendégnek
                </Button>
              </>
            ) : (
              <Button type="button" variant="primary" onClick={() => setHandover(null)}>
                Rendben
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const HandoverControls: React.FC<{
  session: IntakeSessionDetailDto;
  busy: boolean;
  onThisDevice: () => void;
  onSent: (deviceName: string, exitCode: string) => void;
  onRelease: () => void;
}> = ({ session, busy, onThisDevice, onSent, onRelease }) => {
  const id = useId();
  const devicesQuery = useDisplayDevices();
  const tablets = (devicesQuery.data ?? []).filter((d) => d.kind === 'TABLET' && d.status === 'PAIRED');
  const [deviceId, setDeviceId] = useState('');
  const sendMutation = useMutation({
    mutationFn: () => api.sendIntakeToDevice(session.id, deviceId || (tablets[0]?.id ?? '')),
    onSuccess: (result) => onSent(result.deviceName, result.exitCode),
  });

  if (session.assignedDeviceId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-foreground">
          Elküldve tabletre: <strong className="font-semibold">{session.assignedDeviceName ?? 'tablet'}</strong>
        </span>
        <Button type="button" size="sm" onClick={onRelease}>
          Vendégmód lezárása
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {tablets.length > 0 && (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-tablet`}>Párosított tablet</Label>
          <Select value={deviceId || tablets[0].id} onValueChange={setDeviceId}>
            <SelectTrigger id={`${id}-tablet`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tablets.map((tablet) => (
                <SelectItem key={tablet.id} value={tablet.id}>
                  {tablet.name}
                  {tablet.isOnline ? '' : ' (nem elérhető)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={onThisDevice}>
          Vendégmód ezen az eszközön
        </Button>
        {tablets.length > 0 && (
          <Button type="button" variant="primary" disabled={sendMutation.isPending} onClick={() => sendMutation.mutate()}>
            Küldés tabletre
          </Button>
        )}
      </div>
      {tablets.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nincs párosított vendégfelvételi tablet; a Monitorok oldalon párosíthatsz egyet.
        </p>
      )}
    </div>
  );
};

const ProfileEditor: React.FC<{
  profile: IntakeProfileDraft;
  busy: boolean;
  onSave: (profile: IntakeProfileDraft) => void;
}> = ({ profile, busy, onSave }) => {
  const id = useId();
  const [draft, setDraft] = useState<IntakeProfileDraft>(profile);
  const text = (key: Exclude<keyof IntakeProfileDraft, 'gender'>, label: string, type = 'text') => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input
        id={`${id}-${key}`}
        type={type}
        data-barcode-ignore
        value={draft[key] ?? ''}
        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
      />
    </div>
  );
  return (
    <Section
      title="Személyes adatok"
      actions={
        <Button type="button" size="sm" disabled={busy} onClick={() => onSave(draft)}>
          Adatok mentése
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {text('lastName', 'Vezetéknév')}
        {text('firstName', 'Keresztnév')}
        {text('birthDate', 'Születési dátum', 'date')}
        {text('phone', 'Telefonszám', 'tel')}
        {text('email', 'E-mail cím', 'email')}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-gender`}>Nem</Label>
          <Select
            value={draft.gender ?? ''}
            onValueChange={(value) => setDraft((current) => ({ ...current, gender: value as Gender }))}
          >
            <SelectTrigger id={`${id}-gender`}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(Gender).map((gender) => (
                <SelectItem key={gender} value={gender}>
                  {GENDER_LABELS[gender]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Section>
  );
};

const MeasurementsEditor: React.FC<{
  measurements: IntakeMeasurementDraft;
  editable: boolean;
  busy: boolean;
  onSave: (measurements: IntakeMeasurementDraft) => void;
}> = ({ measurements, editable, busy, onSave }) => {
  const id = useId();
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(measurements).map(([k, v]) => [k, v == null ? '' : String(v)])),
  );
  if (!editable && Object.keys(measurements).length === 0) return null;
  const groups = [...new Set(INTAKE_MEASUREMENT_FIELDS.map((f) => f.group))];
  return (
    <Section
      title="Mérések"
      actions={
        editable && (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              onSave(
                Object.fromEntries(
                  Object.entries(draft)
                    .filter(([, v]) => v.trim() !== '')
                    .map(([k, v]) => [k, Number(v.replace(',', '.'))]),
                ),
              )
            }
          >
            Mérések mentése
          </Button>
        )
      }
    >
      {groups.map((group) => (
        <fieldset key={group} className="space-y-2">
          <legend className="text-xs font-semibold text-muted-foreground">{group}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {INTAKE_MEASUREMENT_FIELDS.filter((f) => f.group === group).map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${field.key}`}>{field.label}</Label>
                <Input
                  id={`${id}-${field.key}`}
                  type="number"
                  inputMode="decimal"
                  step={field.step}
                  min={0}
                  max={field.max}
                  data-barcode-ignore
                  disabled={!editable}
                  value={draft[field.key] ?? ''}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </Section>
  );
};
