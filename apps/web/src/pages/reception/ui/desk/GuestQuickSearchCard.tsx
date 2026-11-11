import { GuestDto, PassStatus, PassType } from '@reform/shared';
import { QrCode } from 'lucide-react';
import React from 'react';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CardTitle,
  SearchInput,
  Skeleton,
} from '@/shared/ui';

interface GuestQuickSearchCardProps {
  guests: GuestDto[];
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onScan: (barcode: string) => void;
  onOpenGuest: (guest: GuestDto) => void;
  onOpenDeduct: (guest: GuestDto) => void;
  onOpenDigitalCard: (guest: GuestDto) => void;
}

const describeActivePass = (guest: GuestDto) => {
  const activePass = (guest.passes ?? []).find(
    (p) => p.status === PassStatus.ACTIVE,
  );
  if (!activePass) return 'Nincs aktív bérlet';
  const balance =
    activePass.type === PassType.TIME_BASED
      ? 'Korlátlan'
      : `${activePass.remainingPasses} alk.`;
  return `${activePass.passTemplateName} (${balance})`;
};

// Vendég gyorskereső a recepción: soronként köredzés, kezelés levonása, adatlap, digitális kártya.
export const GuestQuickSearchCard: React.FC<GuestQuickSearchCardProps> = ({
  guests,
  isLoading,
  search,
  onSearchChange,
  onScan,
  onOpenGuest,
  onOpenDeduct,
  onOpenDigitalCard,
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Vendégkereső</CardTitle>
      <CardActions>
        <SearchInput
          aria-label="Vendég keresése"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Név, telefonszám vagy vonalkód"
        />
      </CardActions>
    </CardHeader>
    <CardContent className="p-0 md:p-0">
      {isLoading && guests.length === 0 ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : guests.length === 0 ? (
        <p className="py-7 text-center text-[13px] text-muted-foreground">
          {search
            ? 'Nincs a keresésnek megfelelő vendég.'
            : 'Még nincs vendég. Vegyél fel egyet az Új vendég gombbal.'}
        </p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {guests.map((g) => {
            const name = `${g.lastName} ${g.firstName}`;
            const isFrozen = (g.passes ?? []).some((p) => p.isFrozen);
            return (
              <div
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Button variant="link" onClick={() => onOpenGuest(g)}>
                      {name}
                    </Button>
                    <span className="font-mono text-xs text-muted-foreground">
                      #{g.barcode}
                    </span>
                    {isFrozen && <Badge variant="secondary">Fagyasztva</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {describeActivePass(g)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => onScan(g.barcode)}
                    title="Köredzés érkezés (tagsággal vagy köredzés-bérlettel 0 levonás). Alkalmas bérletnél a kezelésválasztó ablak nyílik meg."
                  >
                    Köredzés
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onOpenDeduct(g)}
                    title="Kezelés kiválasztása és 1 alkalom levonása"
                  >
                    Kezelés -1
                  </Button>
                  <Button size="sm" onClick={() => onOpenGuest(g)}>
                    Adatlap
                  </Button>
                  <Button
                    size="icon"
                    aria-label={`${name} digitális kártyája`}
                    title="Digitális Kártya (QR & Vonalkód)"
                    onClick={() => onOpenDigitalCard(g)}
                  >
                    <QrCode aria-hidden strokeWidth={1.75} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CardContent>
  </Card>
);
