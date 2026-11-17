import { Role } from '@reform/shared';
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth';
import { PageHeader, ToggleGroup, ToggleGroupItem } from '@/shared/ui';
import { AutomationsSection } from './AutomationsSection';
import { BulkSection } from './BulkSection';
import { MessagesSection } from './MessagesSection';
import { TemplatesSection } from './TemplatesSection';

type MailingTab = 'templates' | 'automations' | 'bulk' | 'messages';

const TABS: { id: MailingTab; label: string; adminOnly: boolean }[] = [
  { id: 'templates', label: 'Sablonok', adminOnly: false },
  { id: 'automations', label: 'Automatikus levelek', adminOnly: true },
  { id: 'bulk', label: 'Csoportos küldés', adminOnly: true },
  { id: 'messages', label: 'Elküldött e-mailek', adminOnly: false },
];

// Levelezés (TICKET-55): sablonok, automatikus levelek, csoportos küldés és a napló. A fül a
// `?tab=` paraméterben van, hogy linkelhető és visszalépéssel elérhető legyen. Az automatikus
// levelek és a csoportos küldés csak adminnak látszik (az API is ellenőrzi).
export const MailingPage: React.FC = () => {
  const isAdmin = useAuthStore((s) => s.user?.role === Role.ADMIN);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);
  const requested = searchParams.get('tab');
  const active = tabs.find((t) => t.id === requested)?.id ?? 'templates';

  return (
    <>
      <PageHeader
        title="Levelezés"
        description="Sablonok, automatikus és csoportos levelek, a kiküldött e-mailek naplója."
      />
      <div className="mb-4 overflow-x-auto md:mb-6">
        <ToggleGroup
          type="single"
          aria-label="A Levelezés részei"
          value={active}
          onValueChange={(v) => v && setSearchParams({ tab: v })}
          className="max-w-none flex-nowrap"
        >
          {tabs.map((t) => (
            <ToggleGroupItem key={t.id} value={t.id} className="flex-none">
              {t.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {active === 'templates' && <TemplatesSection isAdmin={isAdmin} />}
      {active === 'automations' && <AutomationsSection />}
      {active === 'bulk' && <BulkSection />}
      {active === 'messages' && <MessagesSection />}
    </>
  );
};
