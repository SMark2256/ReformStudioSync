import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/utils';

// Jelvény (UI-specifikáció 5.7): csak ez a négy variáns, mindig szöveggel. Halvány háttér, a
// szín a szövegben és a keretben, előtte 6 px-es pötty a szöveg színében.
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        success: 'border-success/30 bg-success/10 text-success',
        warning: 'border-warning/30 bg-warning/10 text-warning',
        destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
        secondary: 'border-border bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** A pötty elhagyása a „címke” jellegű `secondary` jelvénynél (Kiegészítő, Te, Csak admin). */
  dot?: boolean;
}

function Badge({
  className,
  variant,
  dot = true,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-current"
        />
      )}
      {children}
    </span>
  );
}

export { Badge };
