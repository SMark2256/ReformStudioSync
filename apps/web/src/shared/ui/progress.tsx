import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/utils';

// Haladásjelző (UI-specifikáció 5.10): 6 px, `bg-muted border rounded-sm`. Hamarosan lejár:
// `warning`; lejárt, elfogyott: `destructive`. `aria-label` kell, vagy `aria-hidden`, ha a
// szám mellette szövegben ott van.
const indicatorVariants = cva(
  'h-full w-full flex-1 transition-transform duration-150 motion-reduce:transition-none',
  {
    variants: {
      tone: {
        primary: 'bg-primary',
        warning: 'bg-warning',
        destructive: 'bg-destructive',
      },
    },
    defaultVariants: { tone: 'primary' },
  },
);

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> &
    VariantProps<typeof indicatorVariants>
>(({ className, value, max = 100, tone, ...props }, ref) => {
  // 0-s maximumnál üres, a maximum fölött teli sáv (nem érvénytelen transform).
  const percent =
    max > 0 ? Math.min(Math.max((value ?? 0) / max, 0), 1) * 100 : 0;
  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={value}
      max={max}
      className={cn(
        'relative h-1.5 w-full overflow-hidden rounded-sm border border-border bg-muted',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={indicatorVariants({ tone })}
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
