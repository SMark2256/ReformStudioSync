import * as React from 'react';

import { cn } from '@/shared/lib/utils';

// „Ugrás a tartalomra” (UI-specifikáció 8.): a `body` első fókuszálható eleme, csak fókuszban
// látszik, kiemelő színű doboz bal felül.
const SkipLink = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement>
>(
  (
    { className, href = '#main', children = 'Ugrás a tartalomra', ...props },
    ref,
  ) => (
    <a
      ref={ref}
      href={href}
      className={cn(
        'sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2',
        className,
      )}
      {...props}
    >
      {children}
    </a>
  ),
);
SkipLink.displayName = 'SkipLink';

export { SkipLink };
