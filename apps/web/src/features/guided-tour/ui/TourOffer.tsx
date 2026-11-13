import { MousePointerClick, X } from 'lucide-react';
import React, { useId } from 'react';
import { cn } from '@/shared/lib/utils';
import {
  Button,
  focusRingClassName,
  modalCloseButtonClassName,
} from '@/shared/ui';

interface TourOfferProps {
  onStart: () => void;
  onDismiss: () => void;
}

// A bemutató felajánlása a még nem látott oldalon: kis, nem modális kártya a jobb alsó sarokban
// (mobilon alul, a fő művelet a lap tetején marad szabadon). Csak rákattintva indul a bemutató.
export const TourOffer: React.FC<TourOfferProps> = ({ onStart, onDismiss }) => {
  const titleId = useId();
  return (
    <aside
      aria-labelledby={titleId}
      className="fixed bottom-3 left-3 right-3 z-40 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg duration-300 animate-in fade-in-0 slide-in-from-bottom-3 md:bottom-5 md:left-auto md:right-5 md:w-80"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-text max-md:hidden"
        >
          <MousePointerClick strokeWidth={1.75} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-sm font-semibold text-foreground">
            Új itt?
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            Megmutatom, mi hol van ezen az oldalon (1 perc).
          </p>
          <Button variant="primary" size="sm" className="mt-3" onClick={onStart}>
            Mutasd
          </Button>
        </div>
        <button
          type="button"
          aria-label="Bezárás"
          title="Bezárás"
          onClick={onDismiss}
          className={cn(
            '-mr-1.5 -mt-1.5',
            modalCloseButtonClassName,
            focusRingClassName,
          )}
        >
          <X aria-hidden strokeWidth={1.75} className="size-4" />
        </button>
      </div>
    </aside>
  );
};
