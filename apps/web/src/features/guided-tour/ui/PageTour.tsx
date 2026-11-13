import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth';
import { findSpotlight, findTour } from '../config/tours';
import { isAutomatedBrowser, useOtherDialogOpen } from '../lib/environment';
import { isTourSeen, useTourStore } from '../model/tourStore';
import { TourOffer } from './TourOffer';

const TourLayer = lazy(() => import('./TourLayer'));

/** A felajánlás az oldal első kirajzolása után jelenik meg, hogy ne villanjon az oldallal együtt. */
const OFFER_DELAY_MS = 1200;

// Oldalbemutató az alkalmazáskeretben (TICKET-53): a még nem látott oldalon felajánlja a bemutatót,
// és ha elindul (a felajánlásból vagy a fejléc „?” gombjával), kirajzolja a réteget. A látott
// bemutatók a fiókban maradnak (`/tours`). Ha az oldal bemutatóját már látta, az oldal friss
// újdonságát (reflektor, TICKET-54) ajánlja fel; az oldal bemutatója után a reflektor nem jön.
export const PageTour: React.FC = () => {
  const { pathname } = useLocation();
  const tour = findTour(pathname);
  const spotlight = findSpotlight(pathname);
  const account = useAuthStore((state) => state.user?.id ?? '');
  const automated = isAutomatedBrowser();
  const { load, markSeen, markAllSeen, start, stop } = useTourStore.getState();
  const active = useTourStore((state) => state.active);
  const loaded = useTourStore((state) => state.status[account] === 'ready');
  const tourSeen = useTourStore(
    (state) => !tour || isTourSeen(state.seenByAccount[account], tour.id),
  );
  const spotlightSeen = useTourStore(
    (state) =>
      !spotlight || isTourSeen(state.seenByAccount[account], spotlight.id),
  );
  const candidate = !tourSeen ? tour : !spotlightSeen ? spotlight : null;
  const offerPending = !!candidate && !automated && loaded && !active;
  const dialogOpen = useOtherDialogOpen(offerPending);
  // Az útvonal, amelyen a felajánlás már kivárt.
  const [settledPath, setSettledPath] = useState<string | null>(null);

  const hasTour = !!tour || !!spotlight;
  useEffect(() => {
    if (hasTour && !automated) load(account);
  }, [account, automated, hasTour, load]);

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
    offerPending && settledPath === pathname && !dialogOpen ? candidate : null;
  const isSpotlight = !!offer && offer.id === spotlight?.id;

  // Bezárt bemutató; az oldal bemutatója az újdonságát is lefedi.
  const close = (tourId: string, step: number) => {
    markSeen(account, tourId, step);
    if (spotlight && tourId === tour?.id && !spotlightSeen) {
      markSeen(account, spotlight.id, 0);
    }
  };

  return (
    <>
      {offer && (
        <TourOffer
          title={isSpotlight ? 'Újdonság ezen az oldalon' : 'Új itt?'}
          text={
            isSpotlight
              ? offer.steps[0].title
              : 'Megmutatom, mi hol van ezen az oldalon (1 perc).'
          }
          onStart={() => start(offer)}
          onDismiss={() => close(offer.id, 0)}
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
                else close(active.tourId, step);
                stop();
              }}
            />
          </Suspense>,
          document.body,
        )}
    </>
  );
};
