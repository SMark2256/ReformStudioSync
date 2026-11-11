import React, { useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/shared/ui';
import { SidebarPanel } from './SidebarPanel';

interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newsCount: number;
  version: string;
}

// Mobilon (768 px alatt) kihúzható menü (UI-specifikáció 9.): ugyanaz a sötét kártya és fiókpanel.
// A Radix kezeli a sötétített hátteret, az Esc-et, a fókuszcsapdát és a fókusz visszaadását a
// fejléc menü gombjára.
export const MobileSidebar: React.FC<MobileSidebarProps> = ({
  open,
  onOpenChange,
  newsCount,
  version,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={contentRef}
        side="left"
        className="inset-y-2 left-2 h-auto w-[300px] max-w-[86vw] overflow-hidden rounded-[14px] border-0 bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
        // Nyitott fiókpanelnél az Esc csak a panelt zárja, a menüt nem.
        onEscapeKeyDown={(event) => {
          if (contentRef.current?.querySelector('[data-account-panel="open"]')) {
            event.preventDefault();
          }
        }}
      >
        <SheetTitle className="sr-only">Főmenü</SheetTitle>
        <SheetDescription className="sr-only">
          Az alkalmazás oldalai és a fiók.
        </SheetDescription>
        <SidebarPanel
          isVisuallyExpanded
          newsCount={newsCount}
          version={version}
          onItemSelect={close}
        />
      </SheetContent>
    </Sheet>
  );
};
