import { GuestDto, PassStatus, PassType } from '@reform/shared';
import { MoreHorizontal } from 'lucide-react';
import React from 'react';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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

// Vendég gyorskereső a recepción: soronként egy látható gomb (Köredzés), a kezelés levonása, az
// adatlap és a digitális kártya a sor „⋯” menüjében; a név is az adatlapot nyitja.
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
  <Card data-tour="reception.search">
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
        <ul
          aria-label="Vendégkereső találatai"
          className="max-h-80 overflow-y-auto"
        >
          {guests.map((g) => {
            const name = `${g.lastName} ${g.firstName}`;
            const isFrozen = (g.passes ?? []).some((p) => p.isFrozen);
            return (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0 md:px-5"
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

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => onScan(g.barcode)}
                    title="Köredzés érkezés (tagsággal vagy köredzés-bérlettel 0 levonás). Alkalmas bérletnél a kezelésválasztó ablak nyílik meg."
                  >
                    Köredzés
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`További műveletek: ${name}`}
                      >
                        <MoreHorizontal aria-hidden strokeWidth={1.75} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onOpenDeduct(g)}>
                        Kezelés -1
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onOpenGuest(g)}>
                        Adatlap
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onOpenDigitalCard(g)}>
                        Digitális kártya (QR)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardContent>
  </Card>
);
