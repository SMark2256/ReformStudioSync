import { GuestDto } from '@reform/shared';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import React, { useState } from 'react';
import { formatBytes } from '@/shared/lib/image';
import { cn } from '@/shared/lib/utils';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  focusRingClassName,
} from '@/shared/ui';

type GuestPhoto = NonNullable<GuestDto['photos']>[number];

const formatDateTime = (iso: string) => new Date(iso).toLocaleString('hu-HU');

const photoTitle = (ph: GuestPhoto) => ph.serviceName ?? 'Állapotfotó';
const photoAlt = (ph: GuestPhoto) => ph.note ?? 'Kezelési fotó';

const savedPercent = (ph: GuestPhoto) =>
  ph.originalSizeBytes > 0
    ? Math.round((1 - ph.compressedSizeBytes / ph.originalSizeBytes) * 100)
    : 0;

// A kártyán és a nagyító nézetben ugyanaz: kezelés, méret, megjegyzés, dátum és felbontás.
const PhotoMeta: React.FC<{ photo: GuestPhoto; withTitle?: boolean }> = ({
  photo,
  withTitle = true,
}) => (
  <div className="space-y-1 text-xs">
    <div
      className={cn(
        'flex items-center gap-2',
        withTitle ? 'justify-between' : 'justify-end',
      )}
    >
      {withTitle && (
        <span className="text-[13px] font-semibold text-foreground">
          {photoTitle(photo)}
        </span>
      )}
      <span className="font-mono text-muted-foreground">
        −{savedPercent(photo)}% ({formatBytes(photo.compressedSizeBytes)})
      </span>
    </div>
    {photo.note && <p className="text-muted-foreground">{photo.note}</p>}
    <p className="font-mono text-muted-foreground">
      {formatDateTime(photo.takenAt)} · {photo.width}×{photo.height}
    </p>
  </div>
);

/**
 * Nagyító nézet (TICKET-52): a teljes kép arányosan, levágás nélkül. Bezárás: X, Esc,
 * háttérre kattintás (a Radix `Dialog` kezeli). Több fotónál a nyilakkal vagy a
 * bal/jobb billentyűvel körbe lehet lapozni. A billentyűket nem állítjuk meg, így a
 * vonalkódolvasó figyelése megmarad.
 */
const GuestPhotoLightbox: React.FC<{
  photos: GuestPhoto[];
  open: boolean;
  index: number;
  onIndexChange: (index: number) => void;
  onOpenChange: (open: boolean) => void;
}> = ({ photos, open, index, onIndexChange, onOpenChange }) => {
  const count = photos.length;
  const current = Math.min(index, count - 1);
  const photo = photos[current];
  const canPage = count > 1;

  const step = (delta: number) => {
    if (canPage) onIndexChange((current + delta + count) % count);
  };

  return (
    <Dialog open={open && photo !== undefined} onOpenChange={onOpenChange}>
      {photo && (
        <DialogContent
          className="md:max-w-[1100px]"
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              step(-1);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              step(1);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{photoTitle(photo)}</DialogTitle>
            <DialogDescription aria-live="polite">
              {canPage
                ? `${current + 1} / ${count} · lapozás a nyilakkal`
                : 'Kezelési állapotfotó'}
            </DialogDescription>
          </DialogHeader>

          <div className="relative min-h-[40vh] flex-1 bg-muted md:h-[62vh] md:flex-none">
            <img
              key={photo.id}
              src={photo.fileUrl}
              alt={photoAlt(photo)}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>

          <div className="shrink-0 border-t border-border px-[18px] py-3">
            <PhotoMeta photo={photo} withTitle={false} />
          </div>

          {canPage && (
            <DialogFooter>
              <Button variant="secondary" onClick={() => step(-1)}>
                <ChevronLeft aria-hidden strokeWidth={1.75} />
                Előző
              </Button>
              <Button variant="secondary" onClick={() => step(1)}>
                Következő
                <ChevronRight aria-hidden strokeWidth={1.75} />
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
};

/** A Fényképek fül képrácsa; a képre kattintva (Enter, szóköz) nagyban nyílik meg. */
export const GuestPhotoGrid: React.FC<{ photos: GuestPhoto[] }> = ({
  photos,
}) => {
  // A nyitottság és az index külön: bezáráskor a kép a záró animáció végéig látszik.
  const [lightbox, setLightbox] = useState({ open: false, index: 0 });
  const openAt = (index: number) => setLightbox({ open: true, index });

  return (
    <>
      <ul
        aria-label="Fényképek"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {photos.map((ph, i) => (
          <li
            key={ph.id}
            className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
          >
            <div
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              aria-label={`${photoTitle(ph)} fénykép megnyitása nagyban`}
              onClick={() => openAt(i)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openAt(i);
              }}
              className={cn(
                'group relative block cursor-zoom-in rounded-t-lg',
                focusRingClassName,
                'focus-visible:ring-inset focus-visible:ring-offset-0',
              )}
            >
              <img
                src={ph.fileUrl}
                alt={photoAlt(ph)}
                className="h-44 w-full bg-muted object-cover"
              />
              <span
                aria-hidden
                className="absolute bottom-2 right-2 inline-flex size-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition-colors duration-150 group-hover:text-foreground motion-reduce:transition-none"
              >
                <ZoomIn strokeWidth={1.75} className="size-4" />
              </span>
            </div>
            <div className="p-3">
              <PhotoMeta photo={ph} />
            </div>
          </li>
        ))}
      </ul>

      <GuestPhotoLightbox
        photos={photos}
        open={lightbox.open}
        index={lightbox.index}
        onIndexChange={(index) => setLightbox({ open: true, index })}
        onOpenChange={(open) => setLightbox((prev) => ({ ...prev, open }))}
      />
    </>
  );
};
