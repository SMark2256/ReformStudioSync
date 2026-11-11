// A `Dialog` és az `AlertDialog` közös stílusa (UI-specifikáció 5.12).

// Háttér: `bg-black/45`, elmosás nélkül.
export const modalOverlayClassName =
  'fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

// Asztalin felülről 8vh-ra (nem függőlegesen középen), max. 84vh; mobilon teljes képernyő.
export const modalContentClassName =
  'fixed z-50 flex flex-col overflow-hidden border-border bg-card text-card-foreground shadow-lg ' +
  'inset-0 h-full w-full rounded-none border-0 ' +
  'md:bottom-auto md:top-[8vh] md:mx-auto md:h-auto md:max-h-[84vh] md:w-[calc(100%-2rem)] md:rounded-lg md:border ' +
  'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';

export const modalSizeClassName = {
  default: 'md:max-w-[640px]',
  form: 'md:max-w-[480px]',
} as const;

export type ModalSize = keyof typeof modalSizeClassName;

export const modalHeaderClassName =
  'flex shrink-0 items-center gap-3 border-b border-border px-[18px] py-3.5';

// Bezárás gomb (X) a modál és a panel fejlécében.
export const modalCloseButtonClassName =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none coarse:size-11';

export const modalTitleClassName = 'text-[15px] font-semibold text-foreground';

export const modalBodyClassName =
  'min-h-0 flex-1 overflow-y-auto p-[18px] text-sm';

// Balra az összeg vagy összefoglaló (`DialogSummary`), jobbra `secondary` „Mégse” és a
// `primary` megerősítő; mobilon az összeg fölöttük, a gombok teljes szélességűek.
export const modalFooterClassName =
  'flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-[18px] py-3 max-md:[&>button]:flex-1';
