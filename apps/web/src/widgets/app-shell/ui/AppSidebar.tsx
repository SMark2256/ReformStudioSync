import { PanelLeft } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { SidebarItem } from '@/shared/ui';
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
} from '../model/sidebarState';
import { SidebarPanel } from './SidebarPanel';

const SIDEBAR_ID = 'app-sidebar';

interface AppSidebarProps {
  isLayoutExpanded: boolean;
  isVisuallyExpanded: boolean;
  onPeekChange: (open: boolean) => void;
  onTogglePinned: () => void;
  newsCount: number;
  version: string;
}

/**
 * Asztali oldalsáv (UI-specifikáció 4.1): sötét, lebegő kártya a tartalom mellett. A szélessége
 * egy rögzített szélességű belső oszlop fölött változik, így csak a kártya doboza méreteződik.
 * Ikonsávként egér fölé húzásra vagy billentyűzetes fókuszra a tartalom fölött kinyílik (peek);
 * kívüli kattintásra, elhagyásra, fókuszvesztésre és navigáláskor visszacsukódik.
 */
export const AppSidebar: React.FC<AppSidebarProps> = ({
  isLayoutExpanded,
  isVisuallyExpanded,
  onPeekChange,
  onTogglePinned,
  newsCount,
  version,
}) => {
  const { pathname } = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);
  // A kattintott link megtartja a DOM-fókuszt, de a peeket csak a billentyűzetes fókusz tartja nyitva.
  const keyboardFocus = useRef(true);
  const isPeeking = !isLayoutExpanded && isVisuallyExpanded;
  const toggleLabel = isLayoutExpanded
    ? 'Oldalsáv összecsukása'
    : 'Oldalsáv kinyitása';

  useEffect(() => onPeekChange(false), [pathname, onPeekChange]);

  // Kívüli koppintás vagy kattintás visszacsukja; érintésnél a fókusz nem mindig mozdul el.
  useEffect(() => {
    if (!isPeeking) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) onPeekChange(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isPeeking, onPeekChange]);

  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    // Érintésnél csak a kívüli koppintás csukja, így a fiókpanel használható marad.
    if (event.pointerType === 'touch') return;
    const active = document.activeElement;
    if (
      !keyboardFocus.current ||
      !active ||
      !event.currentTarget.contains(active)
    ) {
      onPeekChange(false);
    }
  };

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) onPeekChange(false);
  };

  return (
    <div
      ref={cardRef}
      id={SIDEBAR_ID}
      data-tour-bar
      data-state={isVisuallyExpanded ? 'expanded' : 'collapsed'}
      className={cn(
        'fixed bottom-[var(--sidebar-inset)] left-[var(--sidebar-inset)] top-[var(--sidebar-inset)] z-20 overflow-hidden rounded-[14px] bg-sidebar text-sidebar-foreground ring-1 ring-sidebar-border',
        'transition-[width,box-shadow] duration-200 ease-in-out motion-reduce:transition-none',
        isPeeking
          ? 'shadow-[0_18px_48px_rgba(15,18,24,0.45)]'
          : 'shadow-[0_12px_32px_rgba(15,18,24,0.28)]',
      )}
      style={{
        width: isVisuallyExpanded
          ? SIDEBAR_EXPANDED_WIDTH
          : SIDEBAR_COLLAPSED_WIDTH,
      }}
      onPointerEnter={() => onPeekChange(true)}
      onPointerLeave={handlePointerLeave}
      onPointerDownCapture={() => {
        keyboardFocus.current = false;
      }}
      onKeyDownCapture={() => {
        keyboardFocus.current = true;
      }}
      onFocusCapture={() => onPeekChange(true)}
      onBlurCapture={handleBlur}
    >
      <div className="h-full" style={{ width: SIDEBAR_EXPANDED_WIDTH }}>
        <SidebarPanel
          isVisuallyExpanded={isVisuallyExpanded}
          newsCount={newsCount}
          version={version}
          headerAction={
            // Ikonsávban kívül esik a sávon; a billentyűzetes fókusz előbb kinyitja a peeket.
            <SidebarItem
              variant="icon"
              aria-label={toggleLabel}
              aria-expanded={isLayoutExpanded}
              aria-controls={SIDEBAR_ID}
              title={`${toggleLabel} (Ctrl+B)`}
              onClick={(event) => {
                // Egérrel összecsukva a gomb ne tartsa nyitva a peeket a fókuszával.
                if (isLayoutExpanded && event.detail > 0) {
                  event.currentTarget.blur();
                }
                onTogglePinned();
              }}
            >
              <PanelLeft aria-hidden strokeWidth={1.75} />
            </SidebarItem>
          }
        />
      </div>
    </div>
  );
};
