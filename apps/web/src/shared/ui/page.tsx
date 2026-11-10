import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '@/shared/lib/utils';

// Oldaltartalom (UI-specifikáció 4.4, 9.): max. 1400 px, középre igazítva, alul 72 px hely.
// Az alkalmazáskeret `asChild`-dal a `<main id="main" tabIndex={-1}>` elemre teheti.
const PageContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'div';
  return (
    <Comp
      ref={ref}
      className={cn(
        'mx-auto w-full min-w-0 max-w-content px-3 pb-[72px] pt-4 md:px-6 md:pt-6',
        className,
      )}
      {...props}
    />
  );
});
PageContainer.displayName = 'PageContainer';

interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Az oldal `h1`-e, oldalanként egy. */
  title: React.ReactNode;
  /** Egy mondatos leírás a cím alatt. */
  description?: React.ReactNode;
  /** Legfeljebb egy `primary` gomb, a sor végén. */
  actions?: React.ReactNode;
}

// Bal oldalt `h1` + leírás, jobbra a műveletek alsó igazítással; mobilon a műveletek a cím
// alá kerülnek, teljes szélességben.
const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ title, description, actions, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between',
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 text-[13px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex gap-2 max-md:[&>*]:flex-1">{actions}</div>
      )}
    </div>
  ),
);
PageHeader.displayName = 'PageHeader';

export { PageContainer, PageHeader };
