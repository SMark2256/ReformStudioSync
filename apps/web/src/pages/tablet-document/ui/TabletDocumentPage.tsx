import { GuestDocumentDto } from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Eraser,
  FileSignature,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggleButton } from '@/features/toggle-theme';
import { VersionBadge } from '@/widgets/version-changelog';
import { api } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import { useThemeStore } from '@/shared/theme';

export const TabletDocumentPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme } = useThemeStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [consentGdpr, setConsentGdpr] = useState(true);
  const [consentHealth, setConsentHealth] = useState(true);
  const [signerName, setSignerName] = useState('');

  const pendingDocsQuery = useQuery({
    queryKey: ['pending-documents'],
    queryFn: () => api.listPendingDocuments(),
    refetchInterval: 4000,
  });

  const pendingDocs: GuestDocumentDto[] = pendingDocsQuery.data ?? [];

  useEffect(() => {
    if (pendingDocs.length > 0 && !selectedDocId) {
      setSelectedDocId(pendingDocs[0].id);
    }
  }, [pendingDocs, selectedDocId]);

  const selectedDoc: GuestDocumentDto | null =
    pendingDocs.find((d: GuestDocumentDto) => d.id === selectedDocId) ??
    pendingDocs[0] ??
    null;

  useEffect(() => {
    if (!selectedDoc) return;
    setSignerName(
      selectedDoc.fieldsJson?.guestName ?? selectedDoc.guestName ?? '',
    );
  }, [selectedDoc?.id]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const getPointerPos = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0];
      return {
        x: ((t.clientX - rect.left) * canvas.width) / rect.width,
        y: ((t.clientY - rect.top) * canvas.height) / rect.height,
      };
    }
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const startDrawing = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPointerPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#047857';
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPointerPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDoc) throw new Error('Nincs kiválasztott dokumentum');
      const canvas = canvasRef.current;
      const signatureDataUrl = canvas ? canvas.toDataURL('image/png') : '';

      return api.signDocument(selectedDoc.id, {
        signatureDataUrl,
        fieldsJson: {
          guestName: signerName || 'Vendég',
          consentGdpr: consentGdpr ? 'Igen' : 'Nem',
          consentHealth: consentHealth ? 'Igen' : 'Nem',
          signedTimestamp: new Date().toISOString(),
        },
      });
    },
    onSuccess: (signedDoc) => {
      notify.success(
        `Dokumentum sikeresen aláírva és zárolva: ${signedDoc.title}`,
        'A dokumentum bekerült a vendég Dokumentumok fülére.',
      );
      clearCanvas();
      setSelectedDocId('');
      queryClient.invalidateQueries({ queryKey: ['pending-documents'] });
      queryClient.invalidateQueries({ queryKey: ['guests'] });
    },
  });

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/reception');
    }
  };

  return (
    <div
      className={`min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-200 ${
        theme === 'dark' ? 'reception-theme-dark dark' : ''
      }`}
    >
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-6 py-4 shadow-sm">
        <div className="mx-auto max-w-4xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGoBack}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Vissza
            </button>
            <div className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-extrabold text-slate-900 dark:text-white">
                    RE-FORM Stúdió • Tablet Dokumentum-Kitöltő & Aláíró Nézet
                  </h1>
                  <VersionBadge />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Érintőképernyős GDPR, egészségügyi és kezelési nyilatkozat aláírás
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => pendingDocsQuery.refetch()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Frissítés ({pendingDocs.length} várakozó)
            </button>
            <ThemeToggleButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-8">
        {!selectedDoc ? (
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Jelenleg nincs aláírásra váró dokumentum
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              A recepciós munkatárs a Vendégadatlap Dokumentumok fülén tud új nyilatkozatot kiküldeni erre a tabletre.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-lg space-y-6">
            {pendingDocs.length > 1 && (
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                  Várakozó dokumentumok ({pendingDocs.length} db):
                </label>
                <select
                  value={selectedDoc.id}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-bold"
                >
                  {pendingDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({new Date(d.createdAt).toLocaleTimeString('hu-HU')})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
              <div>
                <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-bold text-emerald-800">
                  {selectedDoc.documentType}
                </span>
                <h2 className="mt-2 text-2xl font-black text-slate-900">
                  {selectedDoc.title}
                </h2>
              </div>
              <ShieldCheck className="h-8 w-8 text-emerald-600" />
            </div>

            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-700 space-y-3 leading-relaxed border border-slate-200">
              <p>
                Alulírott kijelentem, hogy a <strong>RE-FORM Stúdió</strong> házirendjét, adatkezelési tájékoztatóját (GDPR) és a választott edzés/kezelés (Női Köredzés, Hypoxi, Testtekercselés) egészségügyi feltételeit megismertem és elfogadom.
              </p>

              <label className="flex items-center gap-3 pt-2 cursor-pointer font-semibold text-slate-900">
                <input
                  type="checkbox"
                  checked={consentGdpr}
                  onChange={(e) => setConsentGdpr(e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 text-emerald-600"
                />
                <span>
                  Elfogadom az Adatkezelési Tájékoztatót (GDPR) és a Házirendet.
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer font-semibold text-slate-900">
                <input
                  type="checkbox"
                  checked={consentHealth}
                  onChange={(e) => setConsentHealth(e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 text-emerald-600"
                />
                <span>
                  Kijelentem, hogy saját felelősségemre veszek részt az edzésen / kezelésen, kizáró egészségügyi ellenjavallat nem áll fenn.
                </span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                Aláíró Vendég Neve *
              </label>
              <input
                type="text"
                required
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Teljes név..."
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base font-bold"
              />
            </div>

            {/* Interactive Touch/Mouse Signature Pad */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase text-slate-500">
                  Érintőképernyős Aláírás (Ujj vagy Stylus) *
                </label>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Aláírás Törlése
                </button>
              </div>
              <div className="overflow-hidden rounded-2xl border-2 border-dashed border-emerald-400 bg-white">
                <canvas
                  ref={canvasRef}
                  width={720}
                  height={220}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-48 touch-none cursor-crosshair bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={
                  !hasSignature ||
                  !consentGdpr ||
                  !consentHealth ||
                  !signerName.trim() ||
                  signMutation.isPending
                }
                onClick={() => signMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-8 py-3.5 text-base font-black text-white shadow-lg hover:bg-emerald-500 disabled:opacity-50"
              >
                <Sparkles className="h-5 w-5" />
                {signMutation.isPending
                  ? 'Aláírás Mentése...'
                  : 'Dokumentum Aláírása & Véglegesítése'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
