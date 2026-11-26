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
  'GUEST.MEASUREMENT_NOT_FOUND': { status: 404, message: 'A mérés nem található.', action: 'notify' },
  'GUEST.MEASUREMENT_DELETE_FORBIDDEN': { status: 403, message: 'A mérést csak adminisztrátor vagy a rögzítő munkatárs törölheti.', action: 'notify' },

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
  'PASS.PAID_EXCEEDS_PRICE': { status: 400, message: 'A most fizetett összeg nem lehet nagyobb a bérlet áránál.', action: 'notify' },
  'PASS.WOMEN_ONLY': { status: 400, message: 'Ez a bérlet vagy tagság csak nőknek szól, férfi vendégnek nem adható el.', action: 'notify' },

  // Beléptetés
  'CHECKIN.GUEST_NOT_FOUND': { status: 400, message: 'Nem található aktív vendég a megadott vonalkóddal.', action: 'notify' },
  'CHECKIN.BALANCE_CHANGED': { status: 409, message: 'A bérlet egyenlege időközben módosult. Kérjük, próbáld újra!', action: 'reload' },
  'CHECKIN.NOT_FOUND': { status: 404, message: 'A beléptetési naplóbejegyzés nem található.', action: 'notify' },
  'CHECKIN.WOMEN_ONLY': { status: 400, message: 'Ez a szolgáltatás csak nőknek szól, férfi vendég nem léptethető be vele.', action: 'notify' },
  'CHECKIN.NOT_REVOCABLE': { status: 400, message: 'Ez a beléptetés már sztornózva van, vagy nem sikeres beléptetés, ezért nem sztornózható.', action: 'notify' },

  // Havi tagság
  'MEMBERSHIP.NOT_FOUND': { status: 404, message: 'A havi tagság nem található.', action: 'notify' },
  'MEMBERSHIP.DUE_NOT_FOUND': { status: 404, message: 'A kiválasztott havi tagdíj-esedékesség nem található.', action: 'notify' },

  // Befizetések
  'PAYMENT.AMOUNT_NOT_POSITIVE': { status: 400, message: 'A befizetett összegnek pozitívnak kell lennie.', action: 'notify' },
  'PAYMENT.MULTIPLE_TARGETS': { status: 400, message: 'Egy befizetés allokáció egyszerre csak egy célhoz (havi tagdíj VAGY bérlet) rendelhető.', action: 'notify' },
  'PAYMENT.NOT_FOUND': { status: 404, message: 'A fizetési tétel nem található.', action: 'notify' },
  'PAYMENT.ALREADY_CANCELLED': { status: 400, message: 'Ez a fizetési tétel már sztornózva lett.', action: 'notify' },

  // Időpontfoglalás (TICKET-57)
  'BOOKING.NOT_FOUND': { status: 404, message: 'A foglalás nem található.', action: 'notify' },
  'BOOKING.TREATMENT_NOT_FOUND': { status: 404, message: 'A kezelés nem található, vagy most nem foglalható.', action: 'notify' },
  'BOOKING.NO_TREATMENTS': { status: 400, message: 'Válassz legalább egy kezelést.', action: 'notify' },
  'BOOKING.CLOSED': { status: 400, message: 'Ebben az időpontban a stúdió zárva tart.', action: 'notify' },
  'BOOKING.OUTSIDE_OPENING_HOURS': { status: 400, message: 'A kezelés a gép szünetével együtt nem fér bele a nyitvatartásba.', action: 'notify' },
  'BOOKING.RESOURCE_BLOCKED': { status: 400, message: 'A gép ebben az időpontban nem foglalható (letiltva).', action: 'notify' },
  'BOOKING.CAPACITY_FULL': { status: 409, message: 'Ez az időpont időközben betelt. Válassz másik időpontot.', action: 'reload' },
  'BOOKING.GUEST_OVERLAP': { status: 409, message: 'A vendégnek ebben az időben már van másik kezelése.', action: 'notify' },
  'BOOKING.IN_PAST': { status: 400, message: 'Elmúlt időpontra nem lehet foglalni.', action: 'notify' },
  'BOOKING.TOO_LATE': { status: 400, message: 'Online legalább 30 perccel a kezdés előtt lehet foglalni.', action: 'notify' },
  'BOOKING.TOO_FAR': { status: 400, message: 'Legfeljebb 30 nappal előre lehet foglalni.', action: 'notify' },
  'BOOKING.CHANGE_CUTOFF': { status: 400, message: 'Online módosítás és lemondás a kezdés előtt legalább 24 órával lehetséges. Ezután a recepció tud segíteni.', action: 'notify' },
  'BOOKING.INVALID_STATUS_CHANGE': { status: 400, message: 'Ez az állapotváltás nem lehetséges.', action: 'notify' },
  'BOOKING.ALREADY_CANCELLED': { status: 400, message: 'Ez a foglalás már le van mondva.', action: 'notify' },
  'BOOKING.CONTACT_REQUIRED': { status: 400, message: 'A foglaláshoz név, telefonszám és e-mail cím kell.', action: 'notify' },
  'BOOKING.PRIVACY_REQUIRED': { status: 400, message: 'A foglaláshoz el kell fogadni az adatkezelési tájékoztatót.', action: 'notify' },
  'BOOKING.LINK_INVALID': { status: 404, message: 'A foglaláskezelő link érvénytelen, vagy a foglalás már nem kezelhető.', action: 'notify' },
  'BOOKING.GUEST_CODE_INVALID': { status: 400, message: 'Hibás vagy lejárt belépőkód. Ha lejárt, kérj újat.', action: 'notify' },
  'BOOKING.GUEST_CODE_RATE_LIMITED': { status: 429, message: 'Túl sok kódkérés. Várj egy percet, és próbáld újra.', action: 'notify' },
  'BOOKING.GUEST_SESSION_INVALID': { status: 401, message: 'A bejelentkezés lejárt. Kérj új belépőkódot.', action: 'notify' },
  'BOOKING.RATE_LIMITED': { status: 429, message: 'Túl sok kérés érkezett. Próbáld újra egy perc múlva.', action: 'notify' },
  'BOOKING.WAITLIST_OFFER_INVALID': { status: 404, message: 'A várólistás ajánlat lejárt, vagy már nem érvényes.', action: 'notify' },
  'BOOKING.WAITLIST_NOT_FOUND': { status: 404, message: 'A várólistás jelentkezés nem található.', action: 'notify' },
  'BOOKING.CLOSURE_INVALID': { status: 400, message: 'A zárvatartás vége a kezdete után legyen.', action: 'notify' },
  'BOOKING.CLOSURE_NOT_FOUND': { status: 404, message: 'A zárvatartás nem található.', action: 'notify' },

  // Vendégfelvétel (TICKET-56)
  'INTAKE.NOT_FOUND': { status: 404, message: 'A vendégfelvétel nem található.', action: 'notify' },
  'INTAKE.PACKAGE_REQUIRED': { status: 400, message: 'Válassz legalább egy csomagot (Köredzés, Hypoxi).', action: 'notify' },
  'INTAKE.PACKAGE_UNKNOWN': { status: 400, message: 'Ismeretlen vagy inaktív csomag.', action: 'notify' },
  'INTAKE.GUEST_REQUIRED': { status: 400, message: 'Válassz meglévő vendéget, vagy add meg az új vendég nevét.', action: 'notify' },
  'INTAKE.DUPLICATE_SUSPECTED': { status: 409, message: 'Hasonló adatokkal már van vendég. Válaszd ki a meglévőt, vagy erősítsd meg, hogy új vendéget veszel fel.', action: 'notify' },
  'INTAKE.NOTHING_MISSING': { status: 409, message: 'A vendég a választott csomagok minden dokumentumát aláírta már.', action: 'notify' },
  'INTAKE.INVALID_TRANSITION': { status: 409, message: 'A vendégfelvétel állapota időközben megváltozott, ez a lépés most nem végezhető el.', action: 'reload' },
  'INTAKE.ANSWERS_INCOMPLETE': { status: 400, message: 'Néhány kötelező kérdés megválaszolatlan.', action: 'notify' },
  'INTAKE.SIGNATURE_REQUIRED': { status: 400, message: 'A beküldéshez aláírás szükséges.', action: 'notify' },
  'INTAKE.PHOTO_TOO_LARGE': { status: 413, message: 'A profilkép túl nagy. Készíts új képet.', action: 'notify' },
  'INTAKE.GUEST_TOKEN_INVALID': { status: 401, message: 'A vendégmód lejárt vagy lezárult. Kérjük, fordulj a recepcióhoz.', action: 'notify' },
  'INTAKE.EXIT_CODE_INVALID': { status: 403, message: 'Hibás kilépési kód.', action: 'notify' },
  'INTAKE.EXIT_LOCKED': { status: 423, message: 'Túl sok hibás kilépési kód. A vendégmódot a recepció PC-jén lehet lezárni.', action: 'notify' },
  'INTAKE.DEVICE_NOT_TABLET': { status: 400, message: 'A kiválasztott eszköz nem párosított tablet.', action: 'notify' },
  'INTAKE.PROFILE_INCOMPLETE': { status: 400, message: 'A jóváhagyáshoz a vendég vezeték- és keresztneve szükséges.', action: 'notify' },
  'INTAKE.DOCUMENT_NOT_FOUND': { status: 404, message: 'Az aláírt dokumentum nem található.', action: 'notify' },
  'INTAKE.PDF_NOT_READY': { status: 409, message: 'A dokumentum PDF-je még nem készült el. Próbáld újra a lezárást.', action: 'notify' },
  'INTAKE.EMAIL_MISSING': { status: 400, message: 'A vendégnek nincs e-mail címe, a dokumentum nem küldhető el.', action: 'notify' },
  'INTAKE.MAIL_FAILED': { status: 502, message: 'A dokumentumot nem sikerült elküldeni. Próbáld újra később.', action: 'retry' },

  // Fájltárolás (TICKET-56)
  'STORAGE.NOT_CONFIGURED': { status: 424, message: 'A dokumentumtárolás nincs beállítva (Supabase Storage). Szólj a rendszergazdának.', action: 'notify' },
  'STORAGE.UNAVAILABLE': { status: 502, message: 'A dokumentumtároló nem érhető el. Próbáld újra később.', action: 'retry' },
  'STORAGE.LINK_INVALID': { status: 403, message: 'A letöltési link lejárt vagy érvénytelen.', action: 'notify' },
  // Vendégkommunikáció (TICKET-55)
  'MAIL.TEMPLATE_NOT_FOUND': { status: 404, message: 'Az e-mail-sablon nem található.', action: 'reload' },
  'MAIL.EMPTY_CONTENT': { status: 400, message: 'A levél tárgya és szövege nem lehet üres.', action: 'notify' },
  'MAIL.GUEST_NO_EMAIL': { status: 400, message: 'A vendégnek nincs rögzített e-mail címe. Add meg az adatlapon, és küldd újra.', action: 'notify' },
  'MAIL.NO_RECIPIENTS': { status: 400, message: 'Nincs olyan címzett, aki megkaphatná a levelet (cím és hozzájárulás kell).', action: 'notify' },
  'MAIL.TOO_MANY_RECIPIENTS': { status: 400, message: 'Egyszerre legfeljebb 2000 címzettnek küldhető levél. Szűkítsd a szűrőt.', action: 'notify' },
  'MAIL.AUTOMATION_TEMPLATE_REQUIRED': { status: 400, message: 'Bekapcsolás előtt válassz sablont az automatikus levélhez.', action: 'notify' },
  'MAIL.MESSAGE_NOT_FOUND': { status: 404, message: 'A levél nem található.', action: 'reload' },
  'MAIL.NOT_RETRYABLE': { status: 400, message: 'Csak hibás levél küldhető újra.', action: 'reload' },
  'MAIL.UNSUBSCRIBE_INVALID': { status: 404, message: 'A leiratkozó link érvénytelen vagy elavult.', action: 'notify' },
} as const satisfies Record<string, AppErrorDefinition>;

export type AppErrorCode = keyof typeof APP_ERROR_CATALOG;

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(APP_ERROR_CATALOG, value)
  );
}
