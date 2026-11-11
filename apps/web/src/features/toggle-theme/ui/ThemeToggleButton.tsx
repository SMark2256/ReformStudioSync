import { Moon, Sun } from 'lucide-react';
import React from 'react';
import { saveTheme, useThemeStore } from '@/shared/theme';
import { Button } from '@/shared/ui';

interface ThemeToggleButtonProps {
  className?: string;
}

export const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({
  className = '',
}) => {
  const theme = useThemeStore((state) => state.theme);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => saveTheme(theme === 'dark' ? 'light' : 'dark')}
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
