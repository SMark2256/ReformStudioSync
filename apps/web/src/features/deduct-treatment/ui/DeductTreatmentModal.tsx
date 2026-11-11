import {
  GuestDto,
  passCoversService,
  PassStatus,
  PassType,
  ServiceDto,
} from '@reform/shared';
import React, { useEffect, useId, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';

// Választható elem (kezelés, bérlet): `secondary` gomb, a kijelölt `aria-pressed`, halvány
// kiemelő háttérrel. A levonás csak a `primary` gombbal történik.
const optionClassName =
  'h-auto whitespace-normal coarse:h-auto coarse:min-h-11 aria-pressed:border-primary aria-pressed:bg-primary-soft';

const blockTitleClassName = 'mb-2 text-xs font-semibold text-muted-foreground';

interface DeductTreatmentModalProps {
  isOpen: boolean;
  initialGuest: GuestDto | null;
  /** Előre kijelölt kezelés (pl. beolvasás után, ha csak egy jöhet szóba). */
  initialServiceId?: string | null;
  /** Előre kijelölt bérlet (pl. beolvasás után, ha csak egy jöhet szóba). */
  initialPassId?: string | null;
  /** Tájékoztató az ablak tetején (pl. miért nyílt meg a beolvasás után). */
  notice?: string;
  guests: GuestDto[];
  services: ServiceDto[];
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirmDeduct: (data: {
    guestId: string;
    passId: string;
    serviceId: string;
    operationKey: string;
    note?: string;
  }) => void;
  onOpenSellPass?: (guest: GuestDto) => void;
}

export const DeductTreatmentModal: React.FC<DeductTreatmentModalProps> = ({
  isOpen,
  initialGuest,
  initialServiceId,
  initialPassId,
  notice,
  guests,
  services,
  isSubmitting = false,
  onClose,
  onConfirmDeduct,
  onOpenSellPass,
}) => {
  const fieldId = useId();
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuestId, setSelectedGuestId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedPassId, setSelectedPassId] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [showErrors, setShowErrors] = useState(false);

  const treatmentServices = services.filter((s) => s.isActive);

  useEffect(() => {
    if (!isOpen) return;
    const g = initialGuest ?? guests[0] ?? null;
    setSelectedGuestId(g?.id ?? '');
    setGuestSearch('');
    setNote('');
    setShowErrors(false);

    const defaultService =
      treatmentServices.find((s) => s.id === initialServiceId) ??
      treatmentServices.find((s) => s.name.toLowerCase().includes('hypoxi')) ??
      treatmentServices[0];
    setSelectedServiceId(defaultService?.id ?? '');
  }, [isOpen, initialGuest, initialServiceId]);

  const selectedGuest = guests.find((g) => g.id === selectedGuestId) ?? null;

  // A szerver szabálya: csak aktív (számolt állapot) bérlet, és ha szolgáltatáshoz kötött, csak arra a kezelésre.
  const activePasses = (selectedGuest?.passes ?? []).filter(
    (p) =>
      p.status === PassStatus.ACTIVE &&
      passCoversService(p.serviceId, selectedServiceId),
  );

  useEffect(() => {
    if (!selectedGuest) {
      setSelectedPassId('');
      return;
    }
    const preselectedPass = activePasses.find((p) => p.id === initialPassId);
    const matchingByService = activePasses.find(
      (p) => p.serviceId && p.serviceId === selectedServiceId,
    );
    setSelectedPassId(
      preselectedPass?.id ?? matchingByService?.id ?? activePasses[0]?.id ?? '',
    );
  }, [selectedGuestId, selectedServiceId, initialPassId]);

  if (!isOpen) return null;

  const selectedPass = activePasses.find((p) => p.id === selectedPassId);
  const selectedService = treatmentServices.find(
    (s) => s.id === selectedServiceId,
  );

  const filteredGuests = guests.filter((g) => {
    const q = guestSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      `${g.lastName} ${g.firstName}`.toLowerCase().includes(q) ||
      g.barcode.toLowerCase().includes(q)
    );
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A gomb nem tiltott: hiányzó adatnál a mezők alatt jelenik meg, mi hiányzik.
    if (!selectedGuest || !selectedPass || !selectedService) {
      setShowErrors(true);
      return;
    }
    onConfirmDeduct({
      guestId: selectedGuest.id,
      passId: selectedPass.id,
      serviceId: selectedServiceId,
      operationKey: `deduct-${selectedPass.id}-${Date.now()}`,
      note: note.trim() || undefined,
    });
  };

  const guestError = showErrors && !selectedGuest;
  const serviceError = showErrors && !selectedService;
  const passError = showErrors && !!selectedGuest && !selectedPass;

  const remainingAfterDeduction =
    selectedPass?.type === PassType.OCCASION_BASED
      ? Math.max(0, (selectedPass.remainingPasses ?? 1) - 1)
      : 'Korlátlan';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            Alkalmas Kezelés Kiválasztása & Bérlet Levonás
          </DialogTitle>
          <DialogDescription>
            Kezelés kiválasztása, bérletellenőrzés és egy alkalom levonása.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-5">
            {notice && (
              <Alert>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-guest`}>Vendég</Label>
              {!initialGuest && (
                <>
                  <Label htmlFor={`${fieldId}-search`} className="sr-only">
                    Vendég keresése
                  </Label>
                  <SearchInput
                    id={`${fieldId}-search`}
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    placeholder="Név vagy vonalkód"
                    className="md:w-full xl:w-full"
                  />
                </>
              )}
              <Select
                value={selectedGuestId}
                onValueChange={setSelectedGuestId}
              >
                <SelectTrigger
                  id={`${fieldId}-guest`}
                  aria-invalid={guestError}
                  aria-describedby={
                    guestError ? `${fieldId}-guest-error` : undefined
                  }
                >
                  <SelectValue placeholder="Válassz vendéget" />
                </SelectTrigger>
                <SelectContent>
                  {filteredGuests.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.lastName} {g.firstName} (#{g.barcode}),{' '}
                      {
                        (g.passes ?? []).filter(
                          (p) => p.status === PassStatus.ACTIVE,
                        ).length
                      }{' '}
                      aktív bérlet
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {guestError && (
                <p
                  id={`${fieldId}-guest-error`}
                  role="alert"
                  className="text-xs text-destructive"
                >
                  Nincs kiválasztott vendég. Válaszd ki, kinek a bérletéből
                  vonod le az alkalmat.
                </p>
              )}
            </div>

            <div
              role="group"
              aria-labelledby={`${fieldId}-services`}
              aria-describedby={
                serviceError ? `${fieldId}-services-error` : undefined
              }
            >
              <h3 id={`${fieldId}-services`} className={blockTitleClassName}>
                Kezelés (a vendégmonitoron is megjelenik)
              </h3>
              {treatmentServices.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    <AlertTitle>Még nincs kezelés felvéve.</AlertTitle>
                    Alkalom levonásához előbb egy admin vegyen fel kezelést a
                    Bérletek és termékek oldalon.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {treatmentServices.map((srv) => (
                    <Button
                      key={srv.id}
                      variant="secondary"
                      aria-pressed={srv.id === selectedServiceId}
                      onClick={() => setSelectedServiceId(srv.id)}
                      className={`${optionClassName} flex-col items-start gap-0.5 p-3 text-left`}
                    >
                      <span className="text-[13px] font-semibold text-foreground">
                        {srv.name}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {srv.durationMinutes} perc,{' '}
                        {srv.priceHuf.toLocaleString('hu-HU')} Ft
                      </span>
                    </Button>
                  ))}
                </div>
              )}
              {serviceError && (
                <p
                  id={`${fieldId}-services-error`}
                  role="alert"
                  className="mt-2 text-xs text-destructive"
                >
                  {treatmentServices.length === 0
                    ? 'Kezelés nélkül nem vonható le alkalom. Előbb vegyél fel kezelést.'
                    : 'Nincs kiválasztott kezelés. Válaszd ki, melyik kezelésre vonod le az alkalmat.'}
                </p>
              )}
            </div>

            <div role="group" aria-labelledby={`${fieldId}-passes`}>
              <h3 id={`${fieldId}-passes`} className={blockTitleClassName}>
                Aktív bérlet ({activePasses.length} elérhető)
              </h3>

              {activePasses.length === 0 ? (
                <Alert variant="destructive" className="flex-wrap items-center">
                  <AlertDescription>
                    <AlertTitle>Nincs felhasználható aktív bérlet.</AlertTitle>A
                    vendégnek nincs érvényes bérlete, vagy minden alkalma
                    elfogyott, illetve fagyasztva van.
                  </AlertDescription>
                  {selectedGuest && onOpenSellPass && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        onClose();
                        onOpenSellPass(selectedGuest);
                      }}
                    >
                      Új bérlet eladása
                    </Button>
                  )}
                </Alert>
              ) : (
                <div className="space-y-2">
                  {activePasses.map((p) => {
                    const rem = p.remainingPasses ?? 0;
                    const isLow =
                      p.type === PassType.OCCASION_BASED && rem <= 2;

                    return (
                      <Button
                        key={p.id}
                        variant="secondary"
                        aria-pressed={p.id === selectedPassId}
                        onClick={() => setSelectedPassId(p.id)}
                        className={`${optionClassName} w-full flex-wrap justify-between gap-2 p-3 text-left`}
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-semibold text-foreground">
                              {p.passTemplateName}
                            </span>
                            {isLow && (
                              <Badge variant="warning">
                                Már csak {rem} alkalom
                              </Badge>
                            )}
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">
                            Érvényes:{' '}
                            {new Date(p.expirationDate).toLocaleDateString(
                              'hu-HU',
                            )}
                            , eddig felhasznált: {p.usedPassesCount ?? 0} alk.
                          </span>
                        </span>
                        <span className="flex flex-col items-end">
                          <span className="text-xs font-normal text-muted-foreground">
                            Jelenlegi egyenleg
                          </span>
                          <span className="text-[13px] font-semibold tabular-nums text-foreground">
                            {p.type === PassType.TIME_BASED
                              ? 'Korlátlan'
                              : `${rem} / ${p.totalPasses} db`}
                          </span>
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}
              {passError && activePasses.length > 0 && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  Nincs kiválasztott bérlet. Válaszd ki, melyik bérletből vonod
                  le az alkalmat.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-note`}>
                Megjegyzés a kezeléshez (nem kötelező)
              </Label>
              <Input
                id={`${fieldId}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Pl. Hypoxi L250 gép, 30 perc"
              />
            </div>

            {selectedGuest && selectedPass && selectedService && (
              <Alert>
                <AlertDescription>
                  <AlertTitle className="text-xs text-muted-foreground">
                    A vendégmonitoron levonás után
                  </AlertTitle>
                  „Üdvözlünk, {selectedGuest.lastName} {selectedGuest.firstName}
                  ! {selectedService.name}. Hátralévő alkalmak:{' '}
                  {remainingAfterDeduction}. Kellemes kezelést kívánunk!”
                </AlertDescription>
              </Alert>
            )}
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Mégse
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Levonás...' : '1 Alkalom Levonása & Üdvözlés'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
