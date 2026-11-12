import { DUPLICATE_SCAN_COOLDOWN_SECONDS } from '@reform/shared';
import { CircleHelp } from 'lucide-react';
import React, { useId, useState } from 'react';
import { useScannerChannelStore } from '@/entities/check-in';
import { isDemoMode } from '@/shared/api';
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

const QUICK_TEST_CODES = [
  { code: '100001', label: 'Kovács Anna (Havi tagság + Hypoxi)' },
  { code: '100002', label: 'Nagy Péter (1–5 nap késés + 1 alk.)' },
  { code: '100003', label: 'Szabó Eszter (Érvényes)' },
  { code: '100004', label: 'Tóth Gábor (15+ nap tartozás)' },
  { code: '100005', label: 'Varga Zsófia (6–15 nap részfiz.)' },
  { code: '100006', label: 'Horváth Dóra (Szüneteltetett)' },
];

interface BarcodeCheckInCardProps {
  onScan: (barcode: string) => void;
}

// Kézi vonalkódos beléptetés (a szkenner mellett); a gyors tesztkódok csak Demó módban.
export const BarcodeCheckInCard: React.FC<BarcodeCheckInCardProps> = ({
  onScan,
}) => {
  const isListening = useScannerChannelStore((state) => state.isListening);
  const [manualBarcode, setManualBarcode] = useState('');
  // Érintőn nincs hover: a súgó koppintásra is nyílik, és kívülre koppintva csukódik.
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const barcodeInputId = useId();

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

        {isDemoMode() && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">
              Gyors tesztkódok:
            </span>
            {QUICK_TEST_CODES.map((item) => (
              <Button
                key={item.code}
                size="sm"
                onClick={() => onScan(item.code)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
