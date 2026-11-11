import { Gender, ServiceCategory } from './enums';

/** A nem felirata a felületen. */
export const GENDER_LABELS: Record<Gender, string> = {
  [Gender.FEMALE]: 'Nő',
  [Gender.MALE]: 'Férfi',
  [Gender.UNSPECIFIED]: 'Nincs megadva',
};

/**
 * Gyakori magyar női keresztnevek, a `normalizeFirstName` alakjában (kisbetű, ékezet nélkül).
 * Ugyanez a lista van a `guest_gender_women_only` migrációban (a meglévő vendégek kitöltése);
 * az egyezést az API `gender.spec.ts` tesztje ellenőrzi, ezért a kettőt együtt módosítsd.
 */
export const FEMALE_FIRST_NAMES: readonly string[] = [
  'adel', 'adrienn', 'agnes', 'agota', 'alexandra', 'aliz', 'amalia', 'andrea', 'angela',
  'aniko', 'anita', 'anna', 'aranka', 'barbara', 'beata', 'beatrix', 'bernadett', 'bettina',
  'bianka', 'boglarka', 'borbala', 'boroka', 'brigitta', 'cecilia', 'cintia', 'csenge',
  'csilla', 'dalma', 'diana', 'dominika', 'dora', 'dorina', 'dorka', 'dorottya', 'edina',
  'edit', 'eleonora', 'ella', 'emese', 'emilia', 'emma', 'eniko', 'erika', 'erzsebet',
  'eszter', 'etelka', 'eva', 'evelin', 'fanni', 'flora', 'franciska', 'fruzsina',
  'gabriella', 'georgina', 'gizella', 'greta', 'gyongyi', 'hajnalka', 'hanna', 'hedvig',
  'helga', 'henrietta', 'ibolya', 'ildiko', 'ilona', 'iren', 'irma', 'ivett', 'izabella',
  'janka', 'jazmin', 'johanna', 'jolan', 'judit', 'julia', 'julianna', 'kamilla',
  'karolina', 'kata', 'katalin', 'kinga', 'kincso', 'kitti', 'klara', 'klaudia', 'kornelia',
  'kriszta', 'krisztina', 'lara', 'laura', 'lea', 'lena', 'lenke', 'lili', 'liliana',
  'lilla', 'linda', 'livia', 'luca', 'lujza', 'magdolna', 'maja', 'margit', 'maria',
  'mariann', 'marianna', 'marietta', 'marta', 'melinda', 'mira', 'monika', 'natalia',
  'nikoletta', 'nikolett', 'noemi', 'nora', 'olga', 'orsolya', 'panna', 'patricia', 'petra',
  'piroska', 'ramona', 'rebeka', 'regina', 'reka', 'renata', 'rita', 'roza', 'rozalia',
  'sara', 'sarolta', 'szabina', 'szilvia', 'szofia', 'szonja', 'tamara', 'terez',
  'teodora', 'timea', 'tunde', 'valentina', 'valeria', 'vanda', 'vera', 'veronika',
  'viktoria', 'vilma', 'viola', 'virag', 'vivien', 'zita', 'zoe', 'zsanett', 'zsofi',
  'zsofia', 'zsuzsa', 'zsuzsanna',
];

/** Gyakori magyar férfi keresztnevek, a `normalizeFirstName` alakjában (lásd `FEMALE_FIRST_NAMES`). */
export const MALE_FIRST_NAMES: readonly string[] = [
  'abel', 'adam', 'adrian', 'akos', 'albert', 'alex', 'andor', 'andras', 'antal', 'arnold',
  'aron', 'arpad', 'attila', 'balazs', 'balint', 'barna', 'barnabas', 'bela', 'bence',
  'benedek', 'benjamin', 'bertalan', 'botond', 'csaba', 'csongor', 'daniel', 'david',
  'denes', 'dezso', 'dominik', 'domonkos', 'ede', 'elek', 'elemer', 'emil', 'endre', 'erik',
  'erno', 'ervin', 'ferenc', 'gabor', 'gaspar', 'gellert', 'gergely', 'gergo', 'geza',
  'gusztav', 'gyorgy', 'gyula', 'henrik', 'hunor', 'ignac', 'imre', 'istvan', 'ivan',
  'jakab', 'janos', 'jeno', 'jozsef', 'kalman', 'karoly', 'kende', 'kevin', 'kolos',
  'kornel', 'kristof', 'krisztian', 'lajos', 'laszlo', 'levente', 'lorand', 'lorant',
  'lorinc', 'marcell', 'mario', 'mark', 'martin', 'marton', 'mate', 'matyas', 'menyhert',
  'mihaly', 'miklos', 'milan', 'nandor', 'nimrod', 'noel', 'norbert', 'oliver', 'otto',
  'pal', 'patrik', 'peter', 'rezso', 'richard', 'robert', 'roland', 'rudolf', 'samuel',
  'sandor', 'sebestyen', 'simon', 'szabolcs', 'szilard', 'szilveszter', 'tamas', 'tibor',
  'tivadar', 'vencel', 'viktor', 'vilmos', 'vince', 'zalan', 'zoltan', 'zsigmond', 'zsolt',
  'zsombor',
];

const FEMALE_SET = new Set(FEMALE_FIRST_NAMES);
const MALE_SET = new Set(MALE_FIRST_NAMES);

/**
 * A keresztnév első tagja kisbetűvel, ékezet nélkül („Anna-Mária” → „anna”, „Zsófia” → „zsofia”).
 * A migráció SQL-je ugyanígy normalizál (`regexp_replace` + `lower` + `translate`).
 */
export function normalizeFirstName(firstName: string | null | undefined): string {
  const first = (firstName ?? '').trim().split(/[\s-]+/)[0] ?? '';
  return first
    .toLocaleLowerCase('hu-HU')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Nem a keresztnévből (a `Guest.firstName` mezőből — a vezetéknév külön mezőben van), a gyakori
 * magyar keresztnevek listája alapján; amit nem ismer fel, az `UNSPECIFIED`. Csak előtöltés:
 * a recepciós átírhatja.
 */
export function inferGenderFromFirstName(firstName: string | null | undefined): Gender {
  const key = normalizeFirstName(firstName);
  if (FEMALE_SET.has(key)) return Gender.FEMALE;
  if (MALE_SET.has(key)) return Gender.MALE;
  return Gender.UNSPECIFIED;
}

export type WomenOnlyAccess = 'ALLOWED' | 'DENIED' | 'GENDER_MISSING';

/**
 * Csak nőknek szóló bérlet / tagság / szolgáltatás (TICKET-42), egyetlen szabály az API-n, a mockban
 * és a felületen: férfi vendégnek nem adható el és vele nem léptethető be (`DENIED`); ha a nem nincs
 * megadva, engedélyezett, de a recepciónak figyelmeztetni kell (`GENDER_MISSING`).
 */
export function womenOnlyAccess(
  gender: Gender | string | null | undefined,
  womenOnly: boolean | null | undefined,
): WomenOnlyAccess {
  if (!womenOnly) return 'ALLOWED';
  if (gender === Gender.MALE) return 'DENIED';
  if (gender === Gender.FEMALE) return 'ALLOWED';
  return 'GENDER_MISSING';
}

/**
 * A havi köredzés tagság szolgáltatása (`Membership.serviceId`): a stúdió köredzés (CIRCUIT)
 * szolgáltatása, az aktív elöl, azon belül a legrégebbi. A migráció ugyanezt a sorrendet követi.
 */
export function pickCircuitMembershipService<
  S extends {
    category: ServiceCategory | string;
    isActive: boolean;
    createdAt: Date | string;
  },
>(services: readonly S[]): S | null {
  const circuit = services
    .filter((s) => s.category === ServiceCategory.CIRCUIT)
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  return circuit[0] ?? null;
}
