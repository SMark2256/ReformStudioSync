import { CircleHelp } from 'lucide-react';
import React from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/shared/ui';
import { findTour, HELP_BUTTON_ANCHOR } from '../config/tours';
import { isAutomatedBrowser } from '../lib/environment';
import { useTourStore } from '../model/tourStore';

// A fejléc „?” gombja: az aktuális oldal bemutatóját bármikor újraindítja. Csak ott látszik, ahol
// van forgatókönyv (és automatizált böngészőben nem).
export const TourHelpButton: React.FC = () => {
  const { pathname } = useLocation();
  const tour = findTour(pathname);
  const start = useTourStore((state) => state.start);
  if (!tour || isAutomatedBrowser()) return null;
  return (
    <Button
      size="icon"
      aria-label="Az oldal bemutatója"
      title="Az oldal bemutatója"
      data-tour={HELP_BUTTON_ANCHOR}
      onClick={() => start(tour)}
    >
      <CircleHelp aria-hidden strokeWidth={1.75} />
    </Button>
  );
};
