import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth';
import { findTour } from '../config/tours';
import { isAutomatedBrowser, useOtherDialogOpen } from '../lib/environment';
import { isTourSeen, useTourStore } from '../model/tourStore';
import { TourOffer } from './TourOffer';

const TourLayer = lazy(() => import('./TourLayer'));

/** A felajánlás az oldal első kirajzolása után jelenik meg, hogy ne villanjon az oldallal együtt. */
const OFFER_DELAY_MS = 1200;

// Oldalbemutató az alkalmazáskeretben (TICKET-53): a még nem látott oldalon felajánlja a bemutatót,
// és ha elindul (a felajánlásból vagy a fejléc „?” gombjával), kirajzolja a réteget. A látott
// bemutatók a fiókban maradnak (`/tours`).
export const PageTour: React.FC = () => {
  const { pathname } = useLocation();
  const tour = findTour(pathname);
  const account = useAuthStore((state) => state.user?.id ?? '');
  const automated = isAutomatedBrowser();
  const { load, markSeen, markAllSeen, start, stop } = useTourStore.getState();
  const active = useTourStore((state) => state.active);
  const loaded = useTourStore((state) => state.status[account] === 'ready');
  const seen = useTourStore(
    (state) => !tour || isTourSeen(state.seenByAccount[account], tour.id),
  );
  const offerPending = !!tour && !automated && loaded && !seen && !active;
  const dialogOpen = useOtherDialogOpen(offerPending);
  // Az útvonal, amelyen a felajánlás már kivárt.
  const [settledPath, setSettledPath] = useState<string | null>(null);

  useEffect(() => {
    if (tour && !automated) load(account);
  }, [account, automated, load, tour]);

  // Oldalváltáskor a futó bemutató bezárul, a felajánlás újra kivár.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setSettledPath(pathname),
      OFFER_DELAY_MS,
    );
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [pathname, stop]);

  const offer =
    offerPending && settledPath === pathname && !dialogOpen ? tour : null;

  return (
    <>
      {offer && (
        <TourOffer
          onStart={() => start(offer)}
          onDismiss={() => markSeen(account, offer.id, 0)}
        />
      )}
      {active &&
        createPortal(
          <Suspense fallback={null}>
            <TourLayer
              key={active.tourId}
              steps={active.steps}
              onClose={(all, step) => {
                // „Többet ne mutass”: a `*` ezt a bemutatót is lefedi, egy mentés elég.
                if (all) markAllSeen(account);
                else markSeen(account, active.tourId, step);
                stop();
              }}
            />
          </Suspense>,
          document.body,
        )}
    </>
  );
};
