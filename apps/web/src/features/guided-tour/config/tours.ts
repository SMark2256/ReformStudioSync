import { RELEASE_NOTES, type ReleaseNote } from '@/entities/release-note';
import { APP_ROUTES, normalizePathname } from '@/shared/config';

// Az oldalbemutatók forgatókönyvei útvonalanként (TICKET-53; a többi oldal: TICKET-54). A Demó és
// a Monitorok oldalon szándékosan nincs bemutató. A célpont CSS-szelektor: az első
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

export const TOURS: Record<string, Tour> = {
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
  [APP_ROUTES.guests.path]: {
    id: 'vendegek-v1',
    steps: [
      {
        target: anchor('guests.search'),
        title: 'Keresés',
        text: 'Név, kártyaszám, telefonszám vagy e-mail alapján megtalálod a vendéget.',
      },
      {
        target: anchor('guests.filter'),
        title: 'Szűrés bérlet szerint',
        text: 'Szűkítsd a listát: érvényes, hamarosan lejáró, vagy lejárt / elfogyott bérletű vendégek.',
      },
      {
        target: anchor('guests.list'),
        title: 'Vendéglista és adatlap',
        text: 'Egy sorra kattintva megnyílik a vendég adatlapja: bérletek, belépések, kezelések, befizetések, mérések és fényképek. A sor végi „⋯” gombbal kezelést vonhatsz le vagy bérletet adhatsz el.',
      },
      {
        target: anchor('guests.new'),
        title: 'Új vendég',
        text: 'Itt veszel fel új vendéget, a kártyaszámával együtt.',
      },
      helpButton,
    ],
  },
  [APP_ROUTES.passes.path]: {
    id: 'berletek-v1',
    steps: [
      {
        target: anchor('passes.templates'),
        title: 'Bérletsablonok',
        text: 'Az eladható bérletek ára, alkalomszáma és érvényessége. Eladáskor ezek közül választasz.',
      },
      {
        target: anchor('passes.new-template'),
        title: 'Új tétel',
        text: 'Új bérletsablont itt veszel fel. Külön ablakban nyílik, mentés után rögtön a listában van.',
      },
      {
        target: anchor('passes.services'),
        title: 'Szolgáltatások és kezelések',
        text: 'A kezelések és szolgáltatások listája. Újat a kártya „Új szolgáltatás” gombjával adsz hozzá.',
      },
      helpButton,
    ],
  },
  [APP_ROUTES.finance.path]: {
    id: 'penzugy-v1',
    steps: [
      {
        target: anchor('finance.summary'),
        title: 'Napi kassza',
        text: 'A mai bevétel összesen és fizetési módonként: készpénz, bankkártya, átutalás.',
      },
      {
        target: anchor('finance.record-payment'),
        title: 'Befizetés rögzítése',
        text: 'Itt rögzítesz befizetést, például havi tagdíjat vagy tartozást.',
      },
      {
        target: anchor('finance.overdue'),
        title: 'Lejárt tagdíjak',
        text: 'Kinek van tagdíj-tartozása, késési kategóriák szerint.',
      },
      {
        target: anchor('finance.payments'),
        title: 'Mai tranzakciók',
        text: 'A mai befizetések tételesen. Ha valamit elrontottál, a Sztornó gombbal visszavonhatod.',
      },
      helpButton,
    ],
  },
  [APP_ROUTES.news.path]: {
    id: 'ujdonsagok-v1',
    steps: [
      {
        target: anchor('news.filter'),
        title: 'Szűrés típus szerint',
        text: 'Válaszd ki, mit nézel: új funkciókat, fejlesztéseket vagy javításokat.',
      },
      {
        target: anchor('news.note'),
        title: 'Egy újdonság',
        text: 'Minden kártyán röviden leírjuk, mi változott. A „Részletek” alatt több is van, és ahol lehet, egy kattintással odajutsz.',
      },
      {
        target: anchor('news.new'),
        optional:
          'Az „Új” jelölés csak az előző látogatás óta bekerült bejegyzéseken van; ha mindet láttad, nincs.',
        title: '„Új” jelölés',
        text: 'Ezeket még nem láttad. A menüben a szám is ezt mutatja.',
      },
      {
        target: anchor('news.jira'),
        title: 'Jira hivatkozás',
        text: 'A jegy száma: rákattintva új lapon megnyílik a Jirában, ha kérdésed van a változásról.',
      },
      helpButton,
    ],
  },
  [APP_ROUTES.settings.path]: {
    id: 'beallitasok-v1',
    steps: [
      {
        target: anchor('settings.theme'),
        title: 'Téma',
        text: 'Világos vagy sötét felület. Ezen a gépen mentődik, és azonnal érvényes.',
      },
      {
        target: anchor('settings.surface'),
        title: 'Felületszín',
        text: 'Az elsődleges gombok, az aktív menüpont és a jelölők színe.',
      },
      {
        target: anchor('settings.buttons'),
        title: 'Gombstílusok',
        text: 'Előnézet: így néznek ki a gombok a választott színnel. Ezek nem csinálnak semmit.',
      },
      {
        target: anchor('settings.tours'),
        title: 'Bemutatók újraindítása',
        text: 'Ha újra látnád a bemutatókat az oldalakon, itt kérheted.',
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

/** Ennyi napig ajánljuk fel egy újdonság reflektorát a bejegyzés dátumától. */
const SPOTLIGHT_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Az oldal friss újdonságának egy lépéses bemutatója (`ReleaseNote.spotlight`), ha van: a
 * legújabb bejegyzésé. A látott-állapot azonosítója `spotlight:<bejegyzés id>`.
 */
export function findSpotlight(
  pathname: string,
  notes: readonly ReleaseNote[] = RELEASE_NOTES,
  now = Date.now(),
): Tour | null {
  const path = normalizePathname(pathname);
  const note = notes.find(
    (n) =>
      !!n.spotlight &&
      normalizePathname(n.spotlight.path) === path &&
      now - Date.parse(n.date) <= SPOTLIGHT_DAYS * DAY_MS,
  );
  if (!note?.spotlight) return null;
  return {
    id: `spotlight:${note.id}`,
    steps: [
      {
        target: anchor(note.spotlight.target),
        title: note.title,
        text: note.spotlight.text,
      },
    ],
  };
}
