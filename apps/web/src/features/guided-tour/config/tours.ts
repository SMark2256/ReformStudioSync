import { APP_ROUTES, normalizePathname } from '@/shared/config';

// Az oldalbemutatók forgatókönyvei útvonalanként (TICKET-53). A célpont CSS-szelektor: az első
// látható találat kapja a reflektort (asztalon az oldalsáv, telefonon a mobil menü eleme); ha egyik
// sem látszik, a lépés kimarad. Célpont nélkül a buborék középen áll. A célelemek stabil horgonya a
// `data-tour="<azonosító>"` attribútum: UI-változásnál a horgonyt meg kell tartani.

/**
 * `optional`: miért hiányozhat jogosan a célpont (pl. csak bizonyos szélességen látszik); nélküle a
 * célpontnak asztalon és telefonon is meg kell lennie.
 */
export type TourStep = {
  target?: string;
  title: string;
  text: string;
  optional?: string;
};

/** Az `id` verziót is tartalmaz: jelentős oldalváltozásnál új verzióval újra felajánlható. */
export type Tour = { id: string; steps: TourStep[] };

/** A célelem horgonya: a komponensen `data-tour="<id>"`. */
const anchor = (id: string) => `[data-tour="${id}"]`;

/** A fejléc „?” gombja (`TourHelpButton`) horgonya. */
export const HELP_BUTTON_ANCHOR = 'tour.help';

/** Az utolsó lépés: a fejléc „?” gombja, amellyel az oldal bemutatója bármikor újraindul. */
const helpButton: TourStep = {
  target: anchor(HELP_BUTTON_ANCHOR),
  title: 'Ha elakadsz',
  text: 'Ha elakadsz, itt bármikor újranézheted.',
};

const TOURS: Record<string, Tour> = {
  [APP_ROUTES.reception.path]: {
    id: 'recepcio-pult-v1',
    steps: [
      {
        title: 'Szia! Körbevezetlek a pulton',
        text: 'Megmutatom a pult legfontosabb részeit, nagyjából egy perc. Bármikor kihagyhatod.',
      },
      {
        target: anchor('reception.scan'),
        title: 'Vonalkódos beléptetés',
        text: 'Itt olvasod be a vendég kártyáját, vagy írd be kézzel a kódot. Rögtön látod, beléphet-e.',
      },
      {
        target: anchor('reception.search'),
        title: 'Vendégkereső',
        text: 'Ha nincs nála a kártya, keresd meg név, telefonszám vagy vonalkód alapján, és innen is beléptetheted.',
      },
      {
        target: anchor('reception.last-check-in'),
        title: 'Utolsó belépés',
        text: 'Itt látod, kit azonosítottál utoljára, és mi a bérlete állapota. Innen vonhatsz le alkalmat, vagy vonhatod vissza a belépést.',
      },
      {
        target: anchor('reception.today-check-ins'),
        title: 'Mai belépések',
        text: 'A mai érkezések és kezelések időrendben. Ha valamit elrontottál, innen is visszavonhatod.',
      },
      {
        target: anchor('reception.today-cash'),
        title: 'Mai kassza',
        text: 'A mai bevétel fizetési módonként. A tartozásokat és a napi zárást a Pénzügyben találod.',
      },
      {
        target: anchor('reception.scanner-channel'),
        optional:
          'A fejléc kapcsolója csak akkor van meg, ha a recepció már kirajzolta a fejlécbe (AppHeaderStatus).',
        title: 'QR csatorna',
        text: 'Ezzel kapcsolod be, hogy a kódolvasó minden oldalon figyeljen. Ha nem olvas be semmit, először ezt nézd meg.',
      },
      helpButton,
    ],
  },
};

/** Az első látható elem a lépés célpontjai közül. */
export function findTarget(selector?: string): HTMLElement | null {
  if (!selector) return null;
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const rect = element.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      getComputedStyle(element).visibility !== 'hidden'
    ) {
      return element;
    }
  }
  return null;
}

/** Az útvonal bemutatója (kis- és nagybetűtől, záró perjeltől függetlenül), ha van. */
export const findTour = (pathname: string): Tour | null =>
  TOURS[normalizePathname(pathname)] ?? null;
