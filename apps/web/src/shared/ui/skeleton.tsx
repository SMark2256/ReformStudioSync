import * as React from 'react';

import { cn } from '@/shared/lib/utils';

// Betöltés a tartalom alakjában (UI-specifikáció 5.15), nem pörgő ikon.
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-md bg-muted motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
