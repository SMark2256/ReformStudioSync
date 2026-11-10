// Szövegmező, többsoros mező és legördülő közös doboza (UI-specifikáció 5.2): 34 px, érintőn
// 44 px és 16 px betű. A `ui-field` osztályt a régi `.reception-theme-dark input` szabályok
// kihagyják (app/styles/index.css), így a tokenszín sötét témában is érvényes.
export const fieldClassName =
  'ui-field w-full rounded-md border border-input bg-card px-2.5 text-[13px] text-foreground ' +
  'transition-colors duration-150 motion-reduce:transition-none placeholder:text-muted-foreground ' +
  'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 ' +
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 ' +
  'aria-[invalid=true]:border-destructive coarse:text-base';
