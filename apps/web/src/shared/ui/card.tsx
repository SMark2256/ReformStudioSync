import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '@/shared/lib/utils';

// Kártya (UI-specifikáció 5.4): nincs színes fejléc, színes bal csík, ikon a cím előtt.
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'min-w-0 rounded-lg border border-border bg-card text-card-foreground shadow-sm',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

// Fejléc `px-5 py-4` (mobilon `px-4`, a törzzsel egy vonalban): cím (+ alcím) balra, a kártya
// műveletei (`CardActions`) jobbra; mobilon tördelődik.
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-4 md:px-5',
      className,
    )}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

// A kártya címe `h2` (14 px 600); `asChild`-dal más címszint is adható.
const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'h2';
  return (
    <Comp
      ref={ref}
      className={cn('text-sm font-semibold text-foreground', className)}
      {...props}
    />
  );
});
CardTitle.displayName = 'CardTitle';

// Alcím a cím mellett: 12 px `muted-foreground`.
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-xs text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto',
      className,
    )}
    {...props}
  />
));
CardActions.displayName = 'CardActions';

// Törzs `p-5` (mobilon `p-4`). Ha csak egy táblázat van benne: `className="p-0"`.
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-4 md:p-5', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex flex-wrap items-center gap-2 border-t border-border px-4 py-4 md:px-5',
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardActions,
  CardContent,
  CardFooter,
};
