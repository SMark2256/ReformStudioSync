import { Moon, Sun } from 'lucide-react';
import React from 'react';
import { notify } from '@/shared/lib/notify';
import { useThemeStore } from '@/shared/theme';
import { Button } from '@/shared/ui';

interface ThemeToggleButtonProps {
  className?: string;
}

export const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({
  className = '',
}) => {
  const { theme, toggleTheme } = useThemeStore();

  const handleToggle = () => {
    const next = toggleTheme();
    notify.info(
      next === 'dark'
        ? 'Recepciós Sötét mód bekapcsolva'
        : 'Recepciós Világos mód bekapcsolva',
      'A Vendégmonitor (/monitor) megjelenése változatlan maradt.',
    );
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleToggle}
      aria-pressed={theme === 'dark'}
      className={className}
    >
      {theme === 'dark' ? (
        <Sun aria-hidden strokeWidth={1.75} />
      ) : (
        <Moon aria-hidden strokeWidth={1.75} />
      )}
      <span className="max-sm:sr-only">Sötét mód</span>
    </Button>
  );
};
