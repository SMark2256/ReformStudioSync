import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/utils';

// Elem a sötét, lebegő oldalsáv kártyán (UI-specifikáció 4.1–4.2): menüpont (`nav`), a fiókpanel
// sora (`panel`), az összecsukó gomb (`icon`). `asChild`-dal link (`NavLink`, `a`), anélkül
// gomb. Az aktív menüpontot a `NavLink` `aria-current="page"`-e jelöli. A fókuszgyűrű belül
// fut, mert a kártya levágja, ami kilóg.
const sidebarItemVariants = cva(
  'flex items-center overflow-hidden whitespace-nowrap rounded-md text-left text-sm transition-[width,background-color,color] duration-200 motion-reduce:transition-none ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-highlight ' +
    'disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        nav:
          'min-h-9 gap-3 px-3 font-medium text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground coarse:min-h-11 [&_svg]:size-[18px] ' +
          'aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-semibold aria-[current=page]:text-sidebar-highlight ' +
          'aria-[current=page]:hover:bg-sidebar-accent aria-[current=page]:hover:text-sidebar-highlight',
        panel:
          'h-9 w-full gap-2.5 px-2.5 text-sidebar-foreground hover:bg-sidebar-hover coarse:h-11 [&_svg]:size-4',
        icon: 'size-8 shrink-0 justify-center text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground coarse:size-11 [&_svg]:size-[18px]',
      },
    },
    defaultVariants: { variant: 'panel' },
  },
);

interface SidebarItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof sidebarItemVariants> {
  asChild?: boolean;
}

const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ className, variant, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(sidebarItemVariants({ variant }), className)}
        {...props}
      />
    );
  },
);
SidebarItem.displayName = 'SidebarItem';

export { SidebarItem };
