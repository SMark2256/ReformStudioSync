import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';

import { cn } from '@/shared/lib/utils';
import { focusRingClassName } from './focus-styles';

// Szegmens 2–5 lehetőségre (UI-specifikáció 5.3): egy közös 1 px `border-input` keret, az
// elemek között függőleges elválasztó; a kijelölt elem `bg-muted`, nem kiemelő színű. Mobilon
// tördelődik, és az elemek kitöltik a sort. `aria-label` a csoporton kötelező.
const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn(
      'inline-flex w-fit max-w-full flex-wrap overflow-hidden rounded-md border border-input bg-card shadow-sm',
      className,
    )}
    {...props}
  />
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      'inline-flex flex-1 items-center justify-center gap-[7px] whitespace-nowrap border-l border-input px-3.5 py-1.5 text-[13px] text-muted-foreground first:border-l-0 md:flex-none',
      'transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none coarse:min-h-11',
      'disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-muted data-[state=on]:font-semibold data-[state=on]:text-foreground',
      'focus-visible:relative focus-visible:z-10 [&_svg]:size-4 [&_svg]:shrink-0',
      focusRingClassName,
      className,
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
