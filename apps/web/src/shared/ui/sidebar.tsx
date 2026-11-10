import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { useIsMobile } from '@/shared/lib/hooks';
import { cn } from '@/shared/lib/utils';
import { Button } from './button';
import { focusRingClassName } from './focus-styles';
import { Separator } from './separator';
import {
  SidebarContext,
  useSidebar,
  useSidebarStore,
  type SidebarContextProps,
} from './sidebar-context';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

// Összecsukható oldalsáv (UI-specifikáció 4.1–4.2, 9.): 236 px, ikonsávként 64 px, mobilon
// (768 px alatt) 300 px-es kihúzható panel. A shadcn `sidebar` alapján, a nem használt
// változatok (floating, inset, rail, almenü) nélkül.
const SIDEBAR_WIDTH = '14.75rem';
const SIDEBAR_WIDTH_ICON = '4rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    /** Kezdőállapot, amíg a felhasználó nem választott (tableten: összecsukva). */
    defaultOpen?: boolean;
  }
>(({ defaultOpen = true, className, style, children, ...props }, ref) => {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  // A felhasználó kézi választása (mentve) erősebb, mint a `defaultOpen`.
  const storedOpen = useSidebarStore((state) => state.open);
  const setOpen = useSidebarStore((state) => state.setOpen);
  const open = storedOpen ?? defaultOpen;

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((value) => !value);
    } else {
      setOpen(!open);
    }
  }, [isMobile, open, setOpen]);

  // Ctrl+B (shadcn alap).
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Szövegmezőben a Ctrl+B nem a menüé.
      const inField =
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        );
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey) &&
        !inField
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? 'expanded' : 'collapsed';

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider>
        <div
          ref={ref}
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH,
              '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            'group/sidebar-wrapper flex min-h-svh w-full bg-background',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
});
SidebarProvider.displayName = 'SidebarProvider';

const Sidebar = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, children, ...props }, ref) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetContent
            data-sidebar="sidebar"
            data-mobile="true"
            side="left"
            className="bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Főmenü</SheetTitle>
              <SheetDescription>Az alkalmazás oldalai.</SheetDescription>
            </SheetHeader>
            <div
              ref={ref}
              className={cn('flex h-full w-full flex-col', className)}
              {...props}
            >
              {children}
            </div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <div
        ref={ref}
        className="group peer hidden text-sidebar-foreground md:block"
        data-state={state}
        data-collapsible={state === 'collapsed' ? 'icon' : ''}
      >
        {/* Helyfoglaló: ennyivel tolódik el a tartalom asztalin. */}
        <div className="relative w-[--sidebar-width] transition-[width] duration-200 ease-in-out group-data-[collapsible=icon]:w-[--sidebar-width-icon] motion-reduce:transition-none" />
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-10 flex h-svh w-[--sidebar-width] border-r border-sidebar-border transition-[width] duration-200 ease-in-out group-data-[collapsible=icon]:w-[--sidebar-width-icon] motion-reduce:transition-none',
            className,
          )}
          {...props}
        >
          <div
            data-sidebar="sidebar"
            className="flex h-full w-full flex-col bg-sidebar"
          >
            {children}
          </div>
        </div>
      </div>
    );
  },
);
Sidebar.displayName = 'Sidebar';

// Összecsukó gomb a lábrészben (`Ctrl+B` is), és `mode="mobile"`-lal a fejléc menü gombja.
const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  Omit<React.ComponentProps<typeof Button>, 'variant' | 'size' | 'children'> & {
    mode?: 'collapse' | 'mobile';
  }
>(({ className, onClick, mode = 'collapse', ...props }, ref) => {
  const { toggleSidebar, open, openMobile } = useSidebar();
  const isMobileTrigger = mode === 'mobile';
  const label = isMobileTrigger
    ? 'Menü megnyitása'
    : open
      ? 'Menü összecsukása'
      : 'Menü kinyitása';
  const Icon = isMobileTrigger ? Menu : open ? PanelLeftClose : PanelLeftOpen;

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="secondary"
      size="icon"
      aria-label={label}
      aria-expanded={isMobileTrigger ? openMobile : open}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <Icon aria-hidden strokeWidth={1.75} />
    </Button>
  );
});
SidebarTrigger.displayName = 'SidebarTrigger';

// A tartalom oldala (fejléc + oldal). Nem `main`: a `<main id="main">` a `PageContainer`
// (`asChild`), így a DOM-ban pontosan egy `header` és egy `main` van.
const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative flex min-w-0 w-full flex-1 flex-col bg-background',
      className,
    )}
    {...props}
  />
));
SidebarInset.displayName = 'SidebarInset';

// Fejrész: 56 px, alsó szegéllyel, logó + név.
const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="header"
    className={cn(
      'flex h-14 shrink-0 items-center gap-2.5 overflow-hidden border-b border-sidebar-border px-3.5',
      className,
    )}
    {...props}
  />
));
SidebarHeader.displayName = 'SidebarHeader';

// Lábrész: felső szegély, `p-2.5`; ikonsávban csak az avatar és a kinyitó gomb marad.
const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="footer"
    className={cn(
      'flex shrink-0 flex-col gap-2 border-t border-sidebar-border p-2.5',
      className,
    )}
    {...props}
  />
));
SidebarFooter.displayName = 'SidebarFooter';

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentProps<typeof Separator>
>(({ className, ...props }, ref) => (
  <Separator
    ref={ref}
    data-sidebar="separator"
    className={cn('mx-2 w-auto bg-sidebar-border', className)}
    {...props}
  />
));
SidebarSeparator.displayName = 'SidebarSeparator';

// A főmenü: `nav aria-label="Főmenü"`, `px-2 py-2.5`, függőlegesen görgethető.
const SidebarContent = React.forwardRef<
  HTMLElement,
  React.ComponentProps<'nav'>
>(({ className, ...props }, ref) => (
  <nav
    ref={ref}
    aria-label="Főmenü"
    data-sidebar="content"
    className={cn(
      'flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-2 py-2.5',
      className,
    )}
    {...props}
  />
));
SidebarContent.displayName = 'SidebarContent';

const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group"
    className={cn('relative flex w-full min-w-0 flex-col', className)}
    {...props}
  />
));
SidebarGroup.displayName = 'SidebarGroup';

// Csoportcímke: 11 px, nagybetűs, `tracking-wide`, 600 `faint`; ikonsávban 1 px-es elválasztó.
const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group-label"
    className={cn('px-2.5 pb-1.5 pt-3.5 first:pt-1', className)}
    {...props}
  >
    <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.6px] text-faint group-data-[collapsible=icon]:sr-only">
      {children}
    </span>
    <span
      aria-hidden
      className="hidden h-px bg-sidebar-border group-data-[collapsible=icon]:block"
    />
  </div>
));
SidebarGroupLabel.displayName = 'SidebarGroupLabel';

const SidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group-content"
    className={cn('w-full', className)}
    {...props}
  />
));
SidebarGroupContent.displayName = 'SidebarGroupContent';

const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<'ul'>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    className={cn('flex w-full min-w-0 flex-col gap-px', className)}
    {...props}
  />
));
SidebarMenu.displayName = 'SidebarMenu';

const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<'li'>
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    className={cn('group/menu-item relative', className)}
    {...props}
  />
));
SidebarMenuItem.displayName = 'SidebarMenuItem';

// Menüpont: 36 px, `rounded-md`, ikon (18 px) és szöveg között 11 px. Aktív: `aria-current`
// (a `NavLink` adja) vagy `isActive`. Jog nélkül: `aria-disabled="true"`, 60% átlátszóság;
// a kattintás nem tiltott, mert toast jelzi az okot.
const sidebarMenuButtonClassName = cn(
  'peer/menu-button flex h-9 w-full items-center gap-[11px] overflow-hidden rounded-md px-2.5 text-left text-[13px] text-muted-foreground',
  'transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none coarse:h-11',
  'aria-[current=page]:bg-primary-soft aria-[current=page]:font-semibold aria-[current=page]:text-primary-text',
  'data-[active=true]:bg-primary-soft data-[active=true]:font-semibold data-[active=true]:text-primary-text',
  'aria-disabled:opacity-60',
  'group-has-[[data-sidebar=menu-badge]]/menu-item:pr-9',
  'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
  '[&>span:last-child]:truncate [&>svg]:size-[18px] [&>svg]:shrink-0',
  focusRingClassName,
);

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & {
    asChild?: boolean;
    isActive?: boolean;
    /** A menüpont neve: ikonsávban tooltip és `aria-label`. */
    tooltip: string;
  }
>(
  (
    { asChild = false, isActive, tooltip, className, onClick, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const { isMobile, state, setOpenMobile } = useSidebar();
    const collapsed = state === 'collapsed' && !isMobile;

    const button = (
      <Comp
        ref={ref}
        data-sidebar="menu-button"
        data-active={isActive}
        aria-label={collapsed ? tooltip : undefined}
        className={cn(sidebarMenuButtonClassName, className)}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          onClick?.(event);
          // Mobilon a menüpont választása bezárja a menüt.
          if (isMobile && !event.defaultPrevented) setOpenMobile(false);
        }}
        {...props}
      />
    );

    // A név tooltipje csak ikonsávban nyílik meg.
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        {collapsed && (
          <TooltipContent side="right" align="center">
            {tooltip}
          </TooltipContent>
        )}
      </Tooltip>
    );
  },
);
SidebarMenuButton.displayName = 'SidebarMenuButton';

// Számláló a menüpont jobb szélén (pl. a bent lévők száma a Recepciónál).
const SidebarMenuBadge = React.forwardRef<
  HTMLSpanElement,
  React.ComponentProps<'span'>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    data-sidebar="menu-badge"
    className={cn(
      'pointer-events-none absolute right-2.5 top-1/2 flex h-[18px] min-w-[18px] -translate-y-1/2 select-none items-center justify-center rounded-full border border-border bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground',
      'group-data-[collapsible=icon]:hidden',
      className,
    )}
    {...props}
  />
));
SidebarMenuBadge.displayName = 'SidebarMenuBadge';

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
};
