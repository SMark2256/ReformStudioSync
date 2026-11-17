import {
  INTAKE_DUPLICATE_REASON_LABELS,
  IntakeDuplicateCandidateDto,
  IntakeProfileDraft,
  IntakeSessionDetailDto,
  toAppError,
} from '@reform/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import React, { useId, useState } from 'react';
import { useIntakePackages } from '@/entities/intake';
import { api } from '@/shared/api';
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  SearchInput,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/ui';

type GuestMode = 'new' | 'existing';

const EMPTY_PROFILE: IntakeProfileDraft = {
  lastName: '',
  firstName: '',
  birthDate: '',
  phone: '',
  email: '',
};

const cleanProfile = (profile: IntakeProfileDraft): IntakeProfileDraft =>
  Object.fromEntries(
    Object.entries(profile).filter(([, value]) => typeof value === 'string' && value.trim()),
  ) as IntakeProfileDraft;

/**
 * „Új vendégfelvétel” (TICKET-56): új vagy meglévő vendég, a csomagok kiválasztása. Új
 * vendégnél a szerver duplikációt ellenőriz (név, születési dátum, telefon, e-mail); egyezésnél
 * a recepciós a meglévőt választja, vagy megerősíti az új vendéget.
 */
export const NewIntakeDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (session: IntakeSessionDetailDto) => void;
}> = ({ open, onOpenChange, onCreated }) => {
  const id = useId();
  const packagesQuery = useIntakePackages();
  const [mode, setMode] = useState<GuestMode>('new');
  const [profile, setProfile] = useState<IntakeProfileDraft>(EMPTY_PROFILE);
  const [search, setSearch] = useState('');
  const [guestId, setGuestId] = useState<string | null>(null);
  const [packageKeys, setPackageKeys] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<IntakeDuplicateCandidateDto[]>([]);

  const guestsQuery = useQuery({
    queryKey: ['guests', 'intake-search', search],
    queryFn: () => api.getGuests(search),
    enabled: mode === 'existing' && search.trim().length >= 2,
  });

  const reset = () => {
    setMode('new');
    setProfile(EMPTY_PROFILE);
    setSearch('');
    setGuestId(null);
    setPackageKeys([]);
    setDuplicates([]);
  };

  const createMutation = useMutation({
    mutationFn: (acknowledgeDuplicates: boolean) =>
      api.createIntakeSession({
        ...(mode === 'existing' && guestId
          ? { guestId }
          : { newGuest: cleanProfile(profile) }),
        packageKeys,
        source: 'PC',
        acknowledgeDuplicates,
      }),
    onSuccess: (session) => {
      reset();
      onCreated(session);
    },
    onError: (error) => {
      const appErr = toAppError(error);
      if (appErr.code === 'INTAKE.DUPLICATE_SUSPECTED') {
        const details = appErr.details as { duplicates?: IntakeDuplicateCandidateDto[] } | undefined;
        setDuplicates(details?.duplicates ?? []);
      }
    },
  });

  const setField = (field: keyof IntakeProfileDraft, value: string) => {
    setDuplicates([]);
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const chooseExisting = (candidate: IntakeDuplicateCandidateDto) => {
    setMode('existing');
    setSearch(candidate.name);
    setGuestId(candidate.guestId);
    setDuplicates([]);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const canSubmit =
    packageKeys.length > 0 &&
    (mode === 'existing'
      ? Boolean(guestId)
      : Boolean(profile.lastName?.trim() && profile.firstName?.trim()));

  const field = (key: keyof IntakeProfileDraft, label: string, type = 'text', required = false) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-${key}`}>
        {label}
        {required && <span aria-hidden> *</span>}
      </Label>
      <Input
        id={`${id}-${key}`}
        type={type}
        data-barcode-ignore
        value={(profile[key] as string | null | undefined) ?? ''}
        onChange={(event) => setField(key, event.target.value)}
      />
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Új vendégfelvétel</DialogTitle>
          <DialogDescription>
            A vendég a tableten tölti ki és írja alá; az adatok jóváhagyás után kerülnek a profilba.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) createMutation.mutate(false);
          }}
        >
          <DialogBody className="space-y-5">
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(value) => {
                if (!value) return;
                setMode(value as GuestMode);
                setDuplicates([]);
              }}
              aria-label="Vendég"
            >
              <ToggleGroupItem value="new">Új vendég</ToggleGroupItem>
              <ToggleGroupItem value="existing">Meglévő vendég</ToggleGroupItem>
            </ToggleGroup>

            {mode === 'new' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field('lastName', 'Vezetéknév', 'text', true)}
                {field('firstName', 'Keresztnév', 'text', true)}
                {field('birthDate', 'Születési dátum', 'date')}
                {field('phone', 'Telefonszám', 'tel')}
                <div className="sm:col-span-2">{field('email', 'E-mail cím', 'email')}</div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Elég a név: a többit a vendég a tableten adja meg. A megadott adatokkal ellenőrizzük
                  a duplikációt.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <SearchInput
                  aria-label="Vendég keresése"
                  placeholder="Név, vonalkód, telefon vagy e-mail"
                  data-barcode-ignore
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <RadioGroup
                  aria-label="Találatok"
                  value={guestId ?? ''}
                  onValueChange={setGuestId}
                  className="max-h-56 gap-1 overflow-y-auto"
                >
                  {(guestsQuery.data ?? []).slice(0, 20).map((guest) => (
                    <label
                      key={guest.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm has-[[data-state=checked]]:border-primary"
                    >
                      <RadioGroupItem value={guest.id} />
                      <span className="font-medium text-foreground">
                        {guest.lastName} {guest.firstName}
                      </span>
                      <span className="text-xs text-muted-foreground">{guest.barcode}</span>
                    </label>
                  ))}
                </RadioGroup>
                {search.trim().length >= 2 && guestsQuery.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nincs találat.</p>
                )}
              </div>
            )}

            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">Csomagok *</legend>
              {(packagesQuery.data ?? []).map((pkg) => (
                <label key={pkg.key} className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={packageKeys.includes(pkg.key)}
                    onCheckedChange={(checked) =>
                      setPackageKeys((current) =>
                        checked === true ? [...current, pkg.key] : current.filter((k) => k !== pkg.key),
                      )
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{pkg.label}</span>
                    <span className="block text-xs text-muted-foreground">{pkg.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {duplicates.length > 0 && (
              <div role="alert" className="space-y-3 rounded-md border border-warning/35 bg-warning/10 p-3 text-sm">
                <p className="font-semibold text-foreground">Hasonló adatokkal már van vendég</p>
                <ul className="space-y-2">
                  {duplicates.map((candidate) => (
                    <li key={candidate.guestId} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-foreground">
                        {candidate.name} ({candidate.barcode}) – egyezés:{' '}
                        {candidate.matchedOn.map((r) => INTAKE_DUPLICATE_REASON_LABELS[r]).join(', ')}
                      </span>
                      <Button type="button" size="sm" onClick={() => chooseExisting(candidate)}>
                        Ez a vendég
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button type="button" size="sm" onClick={() => createMutation.mutate(true)}>
                  Mégis új vendég
                </Button>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={close}>
              Mégse
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit || createMutation.isPending}>
              Előkészítés
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
