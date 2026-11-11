/**
 * Egységes hibakatalógus. Minden hiba stabil kódot kap `TERÜLET.OK` formában;
 * a kód határozza meg a HTTP-státuszt, az alapértelmezett magyar szöveget és azt,
 * hogyan reagáljon rá a kliens.
 *
 * - `notify`: hibaüzenet toastban
 * - `login`:  kijelentkeztetés és átirányítás a bejelentkezésre
 * - `reload`: a kliens frissítse az adatait (az állapot időközben megváltozott)
 * - `retry`:  átmeneti hiba, a művelet később megismételhető
 */
export type AppErrorAction = 'notify' | 'login' | 'reload' | 'retry';

export interface AppErrorDefinition {
  status: number;
  message: string;
  action: AppErrorAction;
}

export const APP_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_]*$/;

export const APP_ERROR_CATALOG = {
  // Általános
  'COMMON.VALIDATION_FAILED': { status: 400, message: 'Hibás vagy hiányzó adatok.', action: 'notify' },
  'COMMON.BAD_REQUEST': { status: 400, message: 'Érvénytelen kérés.', action: 'notify' },
  'COMMON.NOT_FOUND': { status: 404, message: 'A keresett elem nem található.', action: 'notify' },
  'COMMON.CONFLICT': { status: 409, message: 'A művelet ütközik a jelenlegi állapottal.', action: 'reload' },
  'COMMON.PAYLOAD_TOO_LARGE': { status: 413, message: 'A feltöltött adat mérete túl nagy.', action: 'notify' },
  'COMMON.INTERNAL': { status: 500, message: 'Váratlan szerverhiba történt. Kérjük, próbáld újra később!', action: 'retry' },
  'COMMON.NETWORK': { status: 0, message: 'A szerver nem érhető el. Ellenőrizd az internetkapcsolatot!', action: 'retry' },

  // Hitelesítés, jogosultság, kijelzők
  'AUTH.UNAUTHENTICATED': { status: 401, message: 'A munkamenet lejárt. Kérjük, jelentkezz be újra!', action: 'login' },
  'AUTH.CODE_INVALID': { status: 400, message: 'Hibás vagy lejárt belépőkód. Ha lejárt, kérj újat.', action: 'notify' },
  'AUTH.CODE_RATE_LIMITED': { status: 429, message: 'Túl sok kódkérés. Várj egy percet, és próbáld újra.', action: 'notify' },
  'AUTH.MAIL_UNAVAILABLE': { status: 502, message: 'Nem sikerült elküldeni a belépőkódot. Próbáld újra később.', action: 'retry' },
  'AUTH.ACCOUNT_INACTIVE': { status: 401, message: 'A felhasználói fiók nem aktív.', action: 'login' },
  'AUTH.FORBIDDEN': { status: 403, message: 'Nincs jogosultságod a művelet végrehajtásához.', action: 'notify' },
  'AUTH.STAFF_EMAIL_TAKEN': { status: 409, message: 'Ezzel az e-mail címmel már létezik munkatárs.', action: 'notify' },
  'AUTH.DEVICE_NAME_REQUIRED': { status: 400, message: 'Az eszköz nevének megadása kötelező.', action: 'notify' },
  'AUTH.DEVICE_NAME_TAKEN': { status: 409, message: 'Már létezik ilyen nevű kijelző! Válassz másik nevet, vagy kezeld a meglévő eszközt a listában.', action: 'notify' },
  'AUTH.DEVICE_PAIRING_CODE_INVALID': { status: 400, message: 'Érvénytelen vagy már felhasznált 6 jegyű párosító kód.', action: 'notify' },
  'AUTH.DEVICE_PAIRING_CODE_EXPIRED': { status: 400, message: 'A párosító kód lejárt (10 perc után érvénytelenné válik). Kérj új kódot a recepción!', action: 'notify' },
  'AUTH.DEVICE_NOT_FOUND': { status: 404, message: 'A keresett kijelző eszköz nem található.', action: 'notify' },
  'AUTH.DEVICE_TOKEN_INVALID': { status: 401, message: 'Érvénytelen vagy nem párosított kijelző token.', action: 'notify' },

  // Vendégek
  'GUEST.NOT_FOUND': { status: 404, message: 'A vendég nem található.', action: 'notify' },
  'GUEST.BARCODE_TAKEN': { status: 409, message: 'A megadott vonalkód már egy másik vendéghez tartozik.', action: 'notify' },
  'GUEST.PHOTO_TOO_LARGE': { status: 400, message: 'A feltöltött kép mérete meghaladja a megengedett optimalizált határt (750 KB). Kérjük, használd az automatikus WebP tömörítést!', action: 'notify' },
  'GUEST.DOCUMENT_NOT_FOUND': { status: 404, message: 'A dokumentum nem található.', action: 'notify' },

  // Bérletek
  'PASS.TEMPLATE_NOT_FOUND': { status: 404, message: 'A bérletsablon nem található.', action: 'notify' },
  'PASS.TEMPLATE_TOTAL_REQUIRED': { status: 400, message: 'Alkalom alapú bérletnél kötelező megadni az alkalmak számát.', action: 'notify' },
  'PASS.NOT_FOUND': { status: 404, message: 'A bérlet nem található.', action: 'notify' },
  'PASS.FROZEN': { status: 400, message: 'Ez a bérlet jelenleg fagyasztva van (szünetel), nem vonható le belőle alkalom.', action: 'notify' },
  'PASS.NOT_STARTED': { status: 400, message: 'A kiválasztott bérlet még nem kezdődött el, nem vonható le belőle alkalom.', action: 'notify' },
  'PASS.SERVICE_MISMATCH': { status: 400, message: 'A kiválasztott bérlet nem erre a kezelésre szól.', action: 'notify' },
  'PASS.EXPIRED': { status: 400, message: 'A kiválasztott bérlet lejárt vagy inaktív!', action: 'notify' },
  'PASS.NO_REMAINING': { status: 400, message: 'A bérleten elfogytak a felhasználható alkalmak (0 maradt)!', action: 'notify' },
  'PASS.NOT_FREEZABLE': { status: 400, message: 'Csak érvényes bérlet fagyasztható; a lejárt, elfogyott vagy sztornózott bérlet nem.', action: 'notify' },
  'PASS.BALANCE_CHANGED': { status: 409, message: 'Versenyhelyzet észlelve: a bérlet egyenlege időközben módosult, nem történt túlfogyasztás.', action: 'reload' },
  'PASS.USAGE_NOT_FOUND': { status: 404, message: 'A kezelési levonás nem található.', action: 'notify' },
  'PASS.USAGE_ALREADY_REVERSED': { status: 400, message: 'Ez a levonás már korábban vissza lett vonva.', action: 'notify' },
  'PASS.USAGE_NOT_REVERSIBLE': { status: 400, message: 'Csak alkalomlevonási tétel vonható vissza.', action: 'notify' },

  // Beléptetés
  'CHECKIN.GUEST_NOT_FOUND': { status: 400, message: 'Nem található aktív vendég a megadott vonalkóddal.', action: 'notify' },
  'CHECKIN.BALANCE_CHANGED': { status: 409, message: 'A bérlet egyenlege időközben módosult. Kérjük, próbáld újra!', action: 'reload' },
  'CHECKIN.NOT_FOUND': { status: 404, message: 'A beléptetési naplóbejegyzés nem található.', action: 'notify' },
  'CHECKIN.NOT_REVOCABLE': { status: 400, message: 'Ez a beléptetés már sztornózva van, vagy nem sikeres beléptetés, ezért nem sztornózható.', action: 'notify' },

  // Havi tagság
  'MEMBERSHIP.NOT_FOUND': { status: 404, message: 'A havi tagság nem található.', action: 'notify' },
  'MEMBERSHIP.DUE_NOT_FOUND': { status: 404, message: 'A kiválasztott havi tagdíj-esedékesség nem található.', action: 'notify' },

  // Befizetések
  'PAYMENT.AMOUNT_NOT_POSITIVE': { status: 400, message: 'A befizetett összegnek pozitívnak kell lennie.', action: 'notify' },
  'PAYMENT.MULTIPLE_TARGETS': { status: 400, message: 'Egy befizetés allokáció egyszerre csak egy célhoz (havi tagdíj VAGY bérlet) rendelhető.', action: 'notify' },
  'PAYMENT.NOT_FOUND': { status: 404, message: 'A fizetési tétel nem található.', action: 'notify' },
  'PAYMENT.ALREADY_CANCELLED': { status: 400, message: 'Ez a fizetési tétel már sztornózva lett.', action: 'notify' },
} as const satisfies Record<string, AppErrorDefinition>;

export type AppErrorCode = keyof typeof APP_ERROR_CATALOG;

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(APP_ERROR_CATALOG, value)
  );
}
