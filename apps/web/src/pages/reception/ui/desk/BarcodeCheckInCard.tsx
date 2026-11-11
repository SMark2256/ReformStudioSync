import { DUPLICATE_SCAN_COOLDOWN_SECONDS } from '@reform/shared';
import React, { useId, useState } from 'react';
import { useScannerChannelStore } from '@/entities/check-in';
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

// Kézi vonalkódos beléptetés (a szkenner mellett) és a demó tesztkódjai.
export const BarcodeCheckInCard: React.FC<BarcodeCheckInCardProps> = ({
  onScan,
}) => {
  const isListening = useScannerChannelStore((state) => state.isListening);
  const [manualBarcode, setManualBarcode] = useState('');
  const barcodeInputId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vonalkódos beléptetés</CardTitle>
        <CardActions className="justify-end md:w-auto">
          <Badge variant={isListening ? 'success' : 'secondary'}>
            {isListening ? 'Szkenner aktív' : 'Szkenner szünetel'}
          </Badge>
        </CardActions>
      </CardHeader>
      <CardContent className="space-y-3">
        <CardDescription>
          Köredzésnél nem vonódik le alkalom ({DUPLICATE_SCAN_COOLDOWN_SECONDS}{' '}
          mp dupla leolvasás elleni védelem). Kezeléshez az Alkalom
          levonása gombot használd.
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
      </CardContent>
    </Card>
  );
};
