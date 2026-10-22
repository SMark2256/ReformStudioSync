import { GuestDto } from '@reform/shared';
import JsBarcode from 'jsbarcode';
import { Download, QrCode, X } from 'lucide-react';
import QRCode from 'qrcode';
import React, { useEffect, useRef, useState } from 'react';
import { notify } from '../../lib/notify';

interface DigitalPassCardModalProps {
  guest: GuestDto | null;
  onClose: () => void;
}

export const DigitalPassCardModal: React.FC<DigitalPassCardModalProps> = ({
  guest,
  onClose,
}) => {
  const barcodeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!guest) return;

    if (barcodeCanvasRef.current) {
      try {
        JsBarcode(barcodeCanvasRef.current, guest.barcode, {
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
    }

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

    if (barcodeCanvasRef.current) {
      ctx.drawImage(barcodeCanvasRef.current, 56, 220, 360, 130);
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
          'Digitális belépőkártya letöltve!',
          `${guest.lastName} ${guest.firstName} (${guest.barcode}) PNG kártyája elmentve.`,
        );
      };
      qrImg.src = qrDataUrl;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-6 py-4 text-slate-900 dark:text-white">
          <div className="flex items-center gap-2.5">
            <QrCode className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Digitális Belépőkártya (Code-128 & QR)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-inner">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                  ReformStudio VIP Member Pass
                </p>
                <h4 className="mt-1 text-2xl font-bold">
                  {guest.lastName} {guest.firstName}
                </h4>
                <p className="mt-0.5 text-sm text-slate-300">
                  Kártya kód: <span className="font-mono font-semibold text-white">{guest.barcode}</span>
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300 border border-emerald-500/30">
                0 Ft Plastik-Free
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 rounded-xl bg-white barcode-white-box p-4 text-slate-900 sm:grid-cols-3 sm:items-center">
              <div className="sm:col-span-2 flex flex-col items-center justify-center">
                <canvas ref={barcodeCanvasRef} className="max-w-full h-auto" />
                <span className="mt-1 text-[11px] text-slate-500">
                  Code-128 Lézeres / CCD Olvasókhoz
                </span>
              </div>
              <div className="flex flex-col items-center justify-center border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt="QR Code"
                    className="h-28 w-28 object-contain"
                  />
                )}
                <span className="mt-1 text-[11px] text-slate-500">
                  2D Kamera / QR
                </span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            A letöltött PNG képet átküldheted e-mailben a vendégnek, aki a telefonja képernyőjéről közvetlenül beolvashatja a recepción.
          </p>

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Bezárás
            </button>
            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              <Download className="h-4 w-4" />
              Kártya Letöltése (PNG)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
