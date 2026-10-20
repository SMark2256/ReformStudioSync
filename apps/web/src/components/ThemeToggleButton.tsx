import { Moon, Sun } from 'lucide-react';
import React from 'react';
import { notify } from '../lib/notify';
import { useThemeStore } from '../stores/themeStore';

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
    <button
      type="button"
      onClick={handleToggle}
      title={
        theme === 'dark'
          ? 'Váltás világos recepciós felületre'
          : 'Váltás sötét recepciós felületre'
      }
      className={`inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all ${className}`}
    >
      {theme === 'dark' ? (
        <>
          <Sun className="h-3.5 w-3.5 text-amber-400" />
          <span className="hidden sm:inline">Világos mód</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-sky-400" />
          <span className="hidden sm:inline">Sötét mód</span>
        </>
      )}
    </button>
  );
};
