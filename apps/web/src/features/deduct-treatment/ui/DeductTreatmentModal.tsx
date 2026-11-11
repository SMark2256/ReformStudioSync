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

  const treatmentServices = services.filter((s) => s.isActive);

  useEffect(() => {
    if (!isOpen) return;
    const g = initialGuest ?? guests[0] ?? null;
    setSelectedGuestId(g?.id ?? '');
    setGuestSearch('');
    setNote('');

    const defaultService =
      treatmentServices.find((s) => s.name.toLowerCase().includes('hypoxi')) ??
      treatmentServices[0];
    setSelectedServiceId(defaultService?.id ?? '');
  }, [isOpen, initialGuest]);

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
    const matchingByService = activePasses.find(
      (p) => p.serviceId && p.serviceId === selectedServiceId,
    );
    setSelectedPassId(matchingByService?.id ?? activePasses[0]?.id ?? '');
  }, [selectedGuestId, selectedServiceId]);

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
    if (!selectedGuest || !selectedPass || !selectedServiceId) return;
    onConfirmDeduct({
      guestId: selectedGuest.id,
      passId: selectedPass.id,
      serviceId: selectedServiceId,
      operationKey: `deduct-${selectedPass.id}-${Date.now()}`,
      note: note.trim() || undefined,
    });
  };

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
                <SelectTrigger id={`${fieldId}-guest`}>
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
            </div>

            <div role="group" aria-labelledby={`${fieldId}-services`}>
              <h3 id={`${fieldId}-services`} className={blockTitleClassName}>
                Kezelés (a vendégmonitoron is megjelenik)
              </h3>
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
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !selectedPass || !selectedServiceId}
            >
              {isSubmitting ? 'Levonás...' : '1 Alkalom Levonása & Üdvözlés'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
