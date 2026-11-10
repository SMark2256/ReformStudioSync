import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/utils';

// Monogram: a név első és utolsó tagjának kezdőbetűje („Nagy Eszter” → „NE”).
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toLocaleUpperCase('hu-HU');
}

// Avatar (UI-specifikáció 5.11): kör, `bg-muted border`, nem színes. 28 px tábla, 32 px
// oldalsáv, 44 px adatlap. `aria-hidden`: a név mellette szövegben van.
const avatarVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center rounded-full border border-border bg-muted font-semibold text-muted-foreground',
  {
    variants: {
      size: {
        sm: 'size-7 text-[11px]',
        default: 'size-8 text-xs',
        lg: 'size-11 text-[15px]',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

interface AvatarProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof avatarVariants> {
  name: string;
}

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ name, size, className, ...props }, ref) => (
    <span
      ref={ref}
      aria-hidden
      className={cn(avatarVariants({ size }), className)}
      {...props}
    >
      {getInitials(name)}
    </span>
  ),
);
Avatar.displayName = 'Avatar';

export { Avatar };
