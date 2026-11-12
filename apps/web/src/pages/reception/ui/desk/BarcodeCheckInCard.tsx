import { DUPLICATE_SCAN_COOLDOWN_SECONDS } from '@reform/shared';
import { CircleHelp, ScanBarcode } from 'lucide-react';
import React, { useId, useState } from 'react';
import { useScannerChannelStore } from '@/entities/check-in';
import { isTestEnvironment } from '@/shared/api';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui';

// A demó seed (`apps/api/prisma/seed.ts`) tesztvendégei; a nevek a seed szerint.
const TEST_CARDS = [
  {
    code: '100001',
    name: 'Kovács Anna',
    scenario: 'Havi tagság + Hypoxi bérlet',
  },
  {
    code: '100002',
    name: 'Nagy Péter',
    scenario: '1–5 nap késés, 1 alkalom maradt',
  },
  {
    code: '100003',
    name: 'Szabó Eszter',
    scenario: 'Érvényes bérlet, nincs tartozás',
  },
  {
    code: '100004',
    name: 'Tóth Gábor',
    scenario: '15+ nap tartozás, lejárt bérlet',
  },
  {
    code: '100005',
    name: 'Varga Zsófia',
    scenario: '6–15 nap részfizetés, elfogyott bérlet',
  },
  { code: '100006', name: 'Horváth Dóra', scenario: 'Szüneteltetett tagság' },
];

interface BarcodeCheckInCardProps {
  onScan: (barcode: string) => void;
}

// Kézi vonalkódos beléptetés (a szkenner mellett); a tesztkártyák csak tesztkörnyezetben (TICKET-49).
export const BarcodeCheckInCard: React.FC<BarcodeCheckInCardProps> = ({
  onScan,
}) => {
  const isListening = useScannerChannelStore((state) => state.isListening);
  const [manualBarcode, setManualBarcode] = useState('');
  // Érintőn nincs hover: a súgó koppintásra is nyílik, és kívülre koppintva csukódik.
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const barcodeInputId = useId();
  const testCardsTitleId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vonalkódos beléptetés</CardTitle>
        <CardActions className="justify-end md:w-auto">
          <TooltipProvider>
            <Tooltip open={isHelpOpen} onOpenChange={setIsHelpOpen}>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Súgó: hogyan működik a beléptetés"
                  onClick={(e) => {
                    // A Radix a kattintásra zárná a súgót.
                    e.preventDefault();
                    setIsHelpOpen(true);
                  }}
                >
                  <CircleHelp aria-hidden strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Havi tagsággal vagy köredzés-bérlettel köredzés érkezés, alkalom
                levonása nélkül ({DUPLICATE_SCAN_COOLDOWN_SECONDS} mp dupla
                leolvasás elleni védelem). Alkalmas bérletnél a beolvasás után
                a kezelésválasztó ablak nyílik meg, a belépés a levonással
                rögzül.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Badge variant={isListening ? 'success' : 'secondary'}>
            {isListening ? 'Szkenner aktív' : 'Szkenner szünetel'}
          </Badge>
        </CardActions>
      </CardHeader>
      <CardContent className="space-y-3">
        <CardDescription>
          Beolvasás után köredzés érkezés, alkalmas bérletnél
          kezelésválasztás.
        </CardDescription>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!manualBarcode.trim()) return;
            onScan(manualBarcode);
            setManualBarcode('');
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Label htmlFor={barcodeInputId} className="sr-only">
            Vonalkód vagy kártyaszám
          </Label>
          <Input
            id={barcodeInputId}
            type="text"
            data-barcode-input="true"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder="Csippantsd le a QR-kódot, vagy írd be (pl. 100001)"
            className="flex-1 font-mono"
          />
          <Button type="submit" variant="primary">
            Köredzés beléptetés
          </Button>
        </form>

        {isTestEnvironment() && (
          <section
            aria-labelledby={testCardsTitleId}
            className="rounded-md border border-dashed border-primary/40 bg-primary/10 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3
                id={testCardsTitleId}
                className="text-sm font-semibold text-foreground"
              >
                Tesztkártyák
              </h3>
              <Badge variant="warning">Teszt</Badge>
            </div>
            <p className="mt-1 text-[13px] text-foreground">
              Ezekkel a kártyákkal a beléptetés próbálható ki: kattints egyre, és
              úgy működik, mintha a vendég kártyáját olvastad volna be. Élesben
              nem jelennek meg.
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {TEST_CARDS.map((card) => (
                <li key={card.code} className="min-w-0">
                  {/* Kártyaszerű `secondary` gomb: több soros tartalom, balra igazítva. */}
                  <Button
                    className="flex h-auto w-full flex-col items-start justify-start gap-1 whitespace-normal px-3 py-3 text-left coarse:h-auto"
                    aria-label={`Tesztkártya beolvasása: ${card.name}, ${card.scenario}`}
                    onClick={() => onScan(card.code)}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {card.name}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {card.scenario}
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-xs font-normal text-muted-foreground">
                      <ScanBarcode aria-hidden strokeWidth={1.75} />
                      {`#${card.code}`}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
};
