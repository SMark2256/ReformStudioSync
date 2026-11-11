import { GuestDto } from '@reform/shared';
import JsBarcode from 'jsbarcode';
import { Download } from 'lucide-react';
import QRCode from 'qrcode';
import React, { useEffect, useState } from 'react';
import { notify } from '@/shared/lib/notify';
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui';

interface DigitalPassCardModalProps {
  guest: GuestDto | null;
  onClose: () => void;
}

export const DigitalPassCardModal: React.FC<DigitalPassCardModalProps> = ({
  guest,
  onClose,
}) => {
  // Callback ref: a vászon a modál portáljában később jön létre, mint a komponens első effektje.
  const [barcodeCanvas, setBarcodeCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!guest || !barcodeCanvas) return;
    try {
      JsBarcode(barcodeCanvas, guest.barcode, {
        format: 'CODE128',
        width: 2.2,
        height: 64,
        displayValue: true,
        fontSize: 16,
        margin: 10,
        background: '#ffffff',
        lineColor: '#0f172a',
      });
    } catch {
      // Fallback if barcode string has unsupported chars
    }
  }, [guest, barcodeCanvas]);

  useEffect(() => {
    if (!guest) return;
    QRCode.toDataURL(guest.barcode, {
      width: 200,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [guest]);

  if (!guest) return null;

  const handleDownloadPng = () => {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 720;
    exportCanvas.height = 440;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Kártya háttér
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 720, 440);

    // Dekoratív fejléc csík
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 0, 720, 14);

    // Stúdió felirat
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('REFORM STUDIO • DIGITÁLIS BELÉPŐKÁRTYA', 36, 56);

    // Vendég neve
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(`${guest.lastName} ${guest.firstName}`, 36, 106);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px sans-serif';
    ctx.fillText(`Kártyaszám / Azonosító: ${guest.barcode}`, 36, 140);

    // Fehér mező a kódoknak
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(36, 175, 648, 225);

    if (barcodeCanvas) {
      ctx.drawImage(barcodeCanvas, 56, 220, 360, 130);
    }

    if (qrDataUrl) {
      const qrImg = new Image();
      qrImg.onload = () => {
        ctx.drawImage(qrImg, 470, 195, 185, 185);
        const link = document.createElement('a');
        link.download = `ReformStudio_Kartya_${guest.lastName}_${guest.firstName}_${guest.barcode}.png`;
        link.href = exportCanvas.toDataURL('image/png');
        link.click();
        notify.success(
          'Digitális belépőkártya letöltve.',
          `${guest.lastName} ${guest.firstName} (${guest.barcode}) PNG kártyája elmentve.`,
        );
      };
      qrImg.src = qrDataUrl;
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="form">
        <DialogHeader>
          <DialogTitle>Digitális belépőkártya</DialogTitle>
          <DialogDescription>
            {guest.lastName} {guest.firstName} · Code-128 vonalkód és QR-kód
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs font-semibold text-muted-foreground">
              ReformStudio belépőkártya
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {guest.lastName} {guest.firstName}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Kártyaszám: {guest.barcode}
            </p>

            {/* A kódok olvashatóságához mindkét témában fehér háttér kell (szkenner-kontraszt). */}
            <div className="barcode-white-box mt-4 grid grid-cols-1 gap-4 rounded-md border border-border bg-white p-4 sm:grid-cols-3 sm:items-center">
              <div className="flex flex-col items-center justify-center sm:col-span-2">
                <canvas
                  ref={setBarcodeCanvas}
                  role="img"
                  aria-label={`Vonalkód: ${guest.barcode}`}
                  className="h-auto max-w-full"
                />
              </div>
              <div className="flex flex-col items-center justify-center">
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt={`QR-kód: ${guest.barcode}`}
                    className="h-28 w-28 object-contain"
                  />
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Bal oldalt lézeres vagy CCD olvasóhoz, jobb oldalt kamerás (QR)
              olvasóhoz.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            A letöltött PNG képet átküldheted e-mailben a vendégnek, aki a
            telefonja képernyőjéről közvetlenül beolvashatja a recepción.
          </p>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Bezárás</Button>
          </DialogClose>
          <Button variant="primary" onClick={handleDownloadPng}>
            <Download aria-hidden strokeWidth={1.75} />
            Kártya letöltése (PNG)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
