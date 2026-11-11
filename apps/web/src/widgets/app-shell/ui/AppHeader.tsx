import { Moon, Sun } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useThemeStore } from '@/shared/theme';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  SidebarTrigger,
} from '@/shared/ui';

const DAY_FORMAT = new Intl.DateTimeFormat('hu-HU', {
  month: 'long',
  day: 'numeric',
});
const WEEKDAY_FORMAT = new Intl.DateTimeFormat('hu-HU', { weekday: 'long' });
const TIME_FORMAT = new Intl.DateTimeFormat('hu-HU', {
  hour: '2-digit',
  minute: '2-digit',
});

// „november 10., kedd, 22:55”
const formatHeaderDate = (date: Date) =>
  [DAY_FORMAT, WEEKDAY_FORMAT, TIME_FORMAT]
    .map((format) => format.format(date))
    .join(', ');

const MINUTE_MS = 60_000;
const currentMinute = () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;

// Percre kerekített idő: a fejléc pontosan percváltáskor rajzolódik újra.
const useCurrentMinute = () => {
  const [minute, setMinute] = useState(currentMinute);
  useEffect(() => {
    let timeout: number;
    const scheduleNextMinute = () => {
      timeout = window.setTimeout(
        () => {
          setMinute(currentMinute());
          scheduleNextMinute();
        },
        MINUTE_MS - (Date.now() % MINUTE_MS),
      );
    };
    scheduleNextMinute();
    return () => window.clearTimeout(timeout);
  }, []);
  return new Date(minute);
};

interface AppHeaderProps {
  /** Az aktuális oldal neve a morzsamenüben. */
  title: string;
}

// Fejléc (UI-specifikáció 4.3): mobilon menü gomb, morzsamenü, dátum (mobilon rejtve), téma gomb.
export const AppHeader: React.FC<AppHeaderProps> = ({ title }) => {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const now = useCurrentMinute();

  return (
    <header className="sticky top-0 z-10 h-14 shrink-0 border-b border-border bg-card">
      <div className="mx-auto flex h-full max-w-content items-center gap-3 px-3 md:px-6">
        <SidebarTrigger mode="mobile" className="md:hidden" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList>
            <BreadcrumbItem className="max-md:hidden">
              ReformStudio Sync
            </BreadcrumbItem>
            <BreadcrumbSeparator className="max-md:hidden" />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-3">
          <time
            dateTime={now.toISOString()}
            className="text-xs text-muted-foreground max-md:hidden"
          >
            {formatHeaderDate(now)}
          </time>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Sötét mód"
            aria-pressed={theme === 'dark'}
            onClick={() => toggleTheme()}
          >
            {theme === 'dark' ? (
              <Sun aria-hidden strokeWidth={1.75} />
            ) : (
              <Moon aria-hidden strokeWidth={1.75} />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
};
