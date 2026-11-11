// Lenyíló felületek (legördülő lista, menü) közös stílusa (UI-specifikáció 5.2, 5.14):
// `bg-popover border shadow-lg rounded-md`, a shadcn alap fade/zoom animációval.
export const popoverContentClassName =
  'z-50 min-w-[8rem] rounded-md border border-border bg-popover text-popover-foreground shadow-lg ' +
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2';
