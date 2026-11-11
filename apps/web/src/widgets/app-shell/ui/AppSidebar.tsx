import { Role } from '@reform/shared';
import { FlaskConical, LogOut, Megaphone, Moon, Sun } from 'lucide-react';
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth';
import { APP_ROUTES } from '@/shared/config';
import { openGuestMonitorWindow } from '@/shared/lib/monitor-channel';
import { notify } from '@/shared/lib/notify';
import { useThemeStore } from '@/shared/theme';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/shared/ui';
import { NAV_GROUPS } from '../model/navigation';

const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: 'Admin',
  [Role.RECEPTIONIST]: 'Recepciós',
};

interface AppSidebarProps {
  /** Olvasatlan újdonságok száma (az Újdonságok menüpont számlálója). */
  newsCount: number;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ newsCount }) => {
  const navigate = useNavigate();
  const { isMobile, state, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const staffName = user?.name ?? 'Recepciós munkatárs';

  const handleOpenMonitor = (event: React.MouseEvent<HTMLAnchorElement>) => {
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
    if (isMobile) setOpenMobile(false);
  };

  const handleLogout = () => {
    logout();
    notify.info('Sikeres kijelentkezés', 'A munkamenet lezárult.');
    navigate('/login');
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground"
        >
          RS
        </span>
        <span className="min-w-0 group-data-[collapsible=icon]:sr-only">
          <span className="block truncate text-sm font-semibold text-foreground">
            ReformStudio Sync
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            RE-FORM Stúdió
          </span>
        </span>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(({ route, icon: Icon, opensWindow }) => {
                  const { path, title } = APP_ROUTES[route];
                  const content = (
                    <>
                      <Icon aria-hidden strokeWidth={1.75} />
                      <span>{title}</span>
                    </>
                  );
                  return (
                    <SidebarMenuItem key={route}>
                      <SidebarMenuButton asChild tooltip={title}>
                        {opensWindow ? (
                          <a href={path} onClick={handleOpenMonitor}>
                            {content}
                          </a>
                        ) : (
                          <NavLink to={path} end>
                            {content}
                          </NavLink>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              // Ikonsávban ez a menüpont neve is, így a számláló a felolvasóban is megmarad.
              tooltip={
                newsCount > 0
                  ? `${APP_ROUTES.news.title} (${newsCount} olvasatlan)`
                  : APP_ROUTES.news.title
              }
            >
              <NavLink to={APP_ROUTES.news.path} end>
                <Megaphone aria-hidden strokeWidth={1.75} />
                <span>
                  {APP_ROUTES.news.title}
                  {newsCount > 0 && (
                    <span className="sr-only"> ({newsCount} olvasatlan)</span>
                  )}
                </span>
              </NavLink>
            </SidebarMenuButton>
            {newsCount > 0 && (
              <SidebarMenuBadge aria-hidden>{newsCount}</SidebarMenuBadge>
            )}
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={APP_ROUTES.demo.title}>
              <NavLink to={APP_ROUTES.demo.path} end>
                <FlaskConical aria-hidden strokeWidth={1.75} />
                <span>{APP_ROUTES.demo.title}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <section
          aria-label="Bejelentkezett felhasználó"
          className="flex items-center gap-1.5 group-data-[collapsible=icon]:flex-col"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                tooltip={staffName}
                className="h-auto min-h-9 min-w-0 py-1 text-foreground"
                // A menü nyitása ne zárja be a mobil oldalsávot.
                onClick={(event) => event.preventDefault()}
              >
                <Avatar name={staffName} />
                <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-[13px] font-semibold text-foreground">
                    {staffName}
                  </span>
                  {user && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {ROLE_LABELS[user.role]}
                    </span>
                  )}
                </span>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={collapsed ? 'right' : 'top'}
              align="start"
              className="min-w-48"
            >
              <DropdownMenuItem onSelect={() => toggleTheme()}>
                {theme === 'dark' ? (
                  <Sun aria-hidden strokeWidth={1.75} />
                ) : (
                  <Moon aria-hidden strokeWidth={1.75} />
                )}
                {theme === 'dark' ? 'Világos mód' : 'Sötét mód'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout}>
                <LogOut aria-hidden strokeWidth={1.75} />
                Kijelentkezés
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!isMobile && <SidebarTrigger />}
        </section>
      </SidebarFooter>
    </Sidebar>
  );
};
