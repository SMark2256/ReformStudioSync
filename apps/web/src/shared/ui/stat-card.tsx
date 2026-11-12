import * as React from 'react';

import { cn } from '@/shared/lib/utils';
import { Card } from './card';

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** 12 px `faint` magyarázat az érték alatt („3 napon belül vagy lejárt”). */
  hint?: React.ReactNode;
}

// Összesítő szám (UI-specifikáció 5.5): a szám nem színes, nincs mellette nyíl vagy grafikon.
// A blokkot a hívó teszi `section aria-labelledby`-be `sr-only` `h2`-vel.
const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, hint, className, ...props }, ref) => (
    <Card
      ref={ref}
      className={cn('px-4 py-3.5 md:px-5 md:py-4', className)}
      {...props}
    >
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums text-foreground md:text-2xl">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </Card>
  ),
);
StatCard.displayName = 'StatCard';

export { StatCard };
