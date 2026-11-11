import { FlaskConical, Megaphone, type LucideIcon } from 'lucide-react';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { APP_ROUTES, type AppRouteKey } from '@/shared/config';
import { openGuestMonitorWindow } from '@/shared/lib/monitor-channel';
import { cn } from '@/shared/lib/utils';
import { SidebarItem } from '@/shared/ui';
import { NAV_GROUPS } from '../model/navigation';

interface NavItemProps {
  route: AppRouteKey;
  icon: LucideIcon;
  isVisuallyExpanded: boolean;
  /** Külön ablakban nyílik (Vendégmonitor). */
  opensWindow?: boolean;
  /** Számláló (pl. olvasatlan újdonságok); ikonsávban pötty jelzi. */
  count?: number;
  countLabel?: string;
  onSelect?: () => void;
}

// Menüpont: ikonsávban 40 px-es négyzet, nyitva teljes szélességű. A felirat elhalványul, de a
// felolvasó és a tesztek számára a link neve marad.
const NavItem: React.FC<NavItemProps> = ({
  route,
  icon: Icon,
  isVisuallyExpanded,
  opensWindow,
  count = 0,
  countLabel,
  onSelect,
}) => {
  const { path, title } = APP_ROUTES[route];
  const content = (
    <>
      <Icon aria-hidden strokeWidth={1.75} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate transition-opacity duration-200 motion-reduce:transition-none',
          !isVisuallyExpanded && 'opacity-0',
        )}
      >
        {title}
        {count > 0 && countLabel && (
          <span className="sr-only">
            {' '}
            ({count} {countLabel})
          </span>
        )}
      </span>
      {count > 0 && (
        <span
          aria-hidden
          className="rounded-full border border-sidebar-border bg-sidebar-raised px-1.5 text-[11px] leading-[18px] text-sidebar-muted"
        >
          {count}
        </span>
      )}
      {count > 0 && !isVisuallyExpanded && (
        <span
          aria-hidden
          className="absolute left-7 top-1.5 size-2 rounded-full bg-sidebar-highlight"
        />
      )}
    </>
  );
  const className = cn('relative', isVisuallyExpanded ? 'w-full' : 'w-10');

  const handleOpenWindow = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Módosító billentyűvel (új lap) a böngésző alapviselkedése marad.
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    openGuestMonitorWindow();
    onSelect?.();
  };

  return (
    <li>
      <SidebarItem asChild variant="nav" className={className}>
        {opensWindow ? (
          <a href={path} onClick={handleOpenWindow}>
            {content}
          </a>
        ) : (
          <NavLink to={path} end onClick={onSelect}>
            {content}
          </NavLink>
        )}
      </SidebarItem>
    </li>
  );
};

// Szakaszcím nyitva, 1 px-es elválasztó ikonsávban; mindkettő ugyanabban a dobozban, hogy az
// ikonok ne ugorjanak.
const SectionHeading: React.FC<{
  label: string;
  isVisuallyExpanded: boolean;
}> = ({ label, isVisuallyExpanded }) => (
  <p
    aria-hidden={!isVisuallyExpanded}
    className="relative mb-1 h-4 px-3 text-xs font-medium text-sidebar-muted"
  >
    <span
      className={cn(
        'block truncate transition-opacity duration-200 motion-reduce:transition-none',
        !isVisuallyExpanded && 'opacity-0',
      )}
    >
      {label}
    </span>
    <span
      aria-hidden
      className={cn(
        'absolute -left-3 top-1.5 h-px w-16 bg-sidebar-border transition-opacity duration-200 motion-reduce:transition-none',
        isVisuallyExpanded && 'opacity-0',
      )}
    />
  </p>
);

interface SidebarNavigationProps {
  isVisuallyExpanded: boolean;
  /** Olvasatlan újdonságok száma. */
  newsCount: number;
  /** Menüpont választásakor (mobilon a kihúzott menü bezárása). */
  onItemSelect?: () => void;
}

// Főmenü (UI-specifikáció 4.2): a szakaszok, alul az Újdonságok és a Demó mód.
export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  isVisuallyExpanded,
  newsCount,
  onItemSelect,
}) => (
  <nav
    aria-label="Főmenü"
    className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 py-3"
  >
    {NAV_GROUPS.map((group, index) => (
      <div key={group.label} className={cn(index > 0 && 'mt-3')}>
        <SectionHeading
          label={group.label}
          isVisuallyExpanded={isVisuallyExpanded}
        />
        <ul className="space-y-0.5">
          {group.items.map((item) => (
            <NavItem
              key={item.route}
              {...item}
              isVisuallyExpanded={isVisuallyExpanded}
              onSelect={onItemSelect}
            />
          ))}
        </ul>
      </div>
    ))}
    <ul className="mt-auto space-y-0.5 pt-3">
      <NavItem
        route="news"
        icon={Megaphone}
        count={newsCount}
        countLabel="olvasatlan"
        isVisuallyExpanded={isVisuallyExpanded}
        onSelect={onItemSelect}
      />
      <NavItem
        route="demo"
        icon={FlaskConical}
        isVisuallyExpanded={isVisuallyExpanded}
        onSelect={onItemSelect}
      />
    </ul>
  </nav>
);
