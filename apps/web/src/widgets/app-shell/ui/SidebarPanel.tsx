import React from 'react';
import { cn } from '@/shared/lib/utils';
import { SidebarAccount } from './SidebarAccount';
import { SidebarNavigation } from './SidebarNavigation';

const fadeClassName =
  'absolute inset-y-0 flex items-center whitespace-nowrap transition-[opacity,transform] duration-200 motion-reduce:transition-none';

// Fejrész: ikonsávban az „RS” jel a menü ikonjainak tengelyében, nyitva a teljes név.
const SidebarBrand: React.FC<{ isVisuallyExpanded: boolean }> = ({
  isVisuallyExpanded,
}) => (
  <div aria-hidden className="relative h-7 min-w-0 flex-1">
    <span
      className={cn(
        fadeClassName,
        'left-0.5 w-6 justify-center text-[15px] font-bold text-sidebar-highlight',
        isVisuallyExpanded && 'opacity-0',
      )}
    >
      RS
    </span>
    <span
      className={cn(
        fadeClassName,
        'left-0 text-[15px] font-semibold text-sidebar-foreground',
        !isVisuallyExpanded && 'translate-x-2 opacity-0',
      )}
    >
      ReformStudio Sync
    </span>
  </div>
);

interface SidebarPanelProps {
  isVisuallyExpanded: boolean;
  /** A fejrész jobb oldala (asztalin az összecsukó gomb). */
  headerAction?: React.ReactNode;
  newsCount: number;
  version: string;
  /** Menüpont választásakor (mobilon a kihúzott menü bezárása). */
  onItemSelect?: () => void;
}

// Az oldalsáv tartalma: fejrész, főmenü, munkatárs és verzió. Asztalin a lebegő kártyában, mobilon
// a kihúzható menüben.
export const SidebarPanel: React.FC<SidebarPanelProps> = ({
  isVisuallyExpanded,
  headerAction,
  newsCount,
  version,
  onItemSelect,
}) => (
  <div className="flex h-full flex-col">
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-sidebar-border pl-5 pr-3">
      <SidebarBrand isVisuallyExpanded={isVisuallyExpanded} />
      {headerAction}
    </div>
    <SidebarNavigation
      isVisuallyExpanded={isVisuallyExpanded}
      newsCount={newsCount}
      onItemSelect={onItemSelect}
    />
    <SidebarAccount
      isVisuallyExpanded={isVisuallyExpanded}
      version={version}
      onItemSelect={onItemSelect}
    />
  </div>
);
