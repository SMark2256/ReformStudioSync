import React, { useEffect } from 'react';
import { ThemeToggleButton } from '@/features/toggle-theme';
import { SkipLink } from '@/shared/ui';

/** A nyilvános foglaló kerete: alkalmazáskeret és munkatársi menü nélkül. */
export const PublicLayout: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  useEffect(() => {
    const original = document.title;
    document.title = `${title} · Re-Form Stúdió`;
    return () => {
      document.title = original;
    };
  }, [title]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SkipLink />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 md:px-8">
          <p className="text-[15px] font-semibold">Re-Form Stúdió</p>
          <ThemeToggleButton />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-[72px] pt-5 md:space-y-6 md:px-8 md:pt-8">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {children}
      </main>
    </div>
  );
};
