import { Gender } from './enums';
import {
  INTAKE_LEGAL_REVIEW_LABEL,
  IntakeFormDefinitionDto,
  IntakePackageDto,
  IntakeQuestion,
} from './intake';

// A vendégfelvétel beépített csomagjai és kérdőívei (TICKET-56), 1. verzió. Az API induláskor
// (és a seed) ezekből tölti fel az `intake_packages` és `intake_form_definitions` táblát; új
// szöveg új verziószámmal kerül be, a régi aláírt pillanatképek nem változnak.
//
// A szövegek HELYŐRZŐK: élesítés előtt jogi és szakmai felülvizsgálat kell (a Hypoxi pontos
// gyártói ellenjavallatai is), ezért mindegyik `legalReviewPending: true`.

const placeholder = (text: string) => `[${INTAKE_LEGAL_REVIEW_LABEL}]\n\n${text}`;

const YES_NO = [
  { value: 'YES', label: 'Igen' },
  { value: 'NO', label: 'Nem' },
];

const yesNo = (
  id: string,
  label: string,
  warning?: string,
  extra: Partial<IntakeQuestion> = {},
): IntakeQuestion => ({
  id,
  label,
  type: 'YES_NO',
  options: YES_NO,
  required: true,
  ...(warning ? { warning: { values: ['YES'], text: warning } } : {}),
  ...extra,
});

const LAB_LEVELS = [
  { value: 'NORMAL', label: 'Normál tartományban' },
  { value: 'ELEVATED', label: 'Emelkedett' },
  { value: 'HIGH', label: 'Magas' },
  { value: 'LOW', label: 'Alacsony' },
  { value: 'UNKNOWN', label: 'Nem tudom' },
];

const labQuestion = (id: string, label: string, riskValues: string[]): IntakeQuestion => ({
  id,
  label,
  type: 'SINGLE_CHOICE',
  options: LAB_LEVELS,
  showIf: { questionId: 'labLast6Months', equals: 'YES' },
  help: 'Nem kötelező pontos értéket megadni, elég a kategória.',
  warning: {
    values: riskValues,
    text: 'Az eltérő laboreredményt az edzés vagy kezelés előtt beszéljük át. Kérjük, jelezd a recepción.',
  },
});

export const INTAKE_PACKAGE_CIRCUIT = 'CIRCUIT';
export const INTAKE_PACKAGE_HYPOXI = 'HYPOXI';

export const BUILT_IN_INTAKE_PACKAGES: IntakePackageDto[] = [
  {
    key: INTAKE_PACKAGE_CIRCUIT,
    label: 'Köredzés',
    description: 'Hidraulikus gépes köredzés: ellenjavallatok és tagsági szerződés.',
    formKeys: ['circuit-contraindications', 'circuit-membership-contract'],
  },
  {
    key: INTAKE_PACKAGE_HYPOXI,
    label: 'Hypoxi',
    description:
      'Vákuumos ülőkerékpár: ellenjavallatok és tájékozott beleegyezés. Bérletet az első edzés után, személyesen választ.',
    formKeys: ['hypoxi-contraindications', 'hypoxi-informed-consent'],
  },
];

export const BUILT_IN_INTAKE_FORMS: IntakeFormDefinitionDto[] = [
  {
    key: 'privacy-notice',
    version: 1,
    title: 'Adatkezelési tájékoztató',
    kind: 'NOTICE',
    scope: 'COMMON',
    order: 10,
    requiresSignature: true,
    legalReviewPending: true,
    bodyText: placeholder(
      [
        'Adatkezelő: Mozdulj az egészségedért! Non-Profit Kft. (a Re-Form Stúdió üzemeltetője).',
        'A stúdióban kamerarendszer nem működik.',
        'Az adatkezelés célja a tagsági jogviszony és a szolgáltatások nyújtása, a bérletek és belépések nyilvántartása, valamint – külön hozzájárulással – az egészségi állapothoz igazított edzés és kezelés.',
        'Adatfeldolgozók: Supabase (adatbázis és dokumentumtárolás), Számlázz.hu (számlázás), ELIN.hu, valamint a ténylegesen használt Google-szolgáltatások. A pontos szerződéses és szerverrégiós adatok ellenőrzés alatt állnak.',
        'Az érintett jogai: tájékoztatás, hozzáférés, helyesbítés, törlés, korlátozás, adathordozhatóság, tiltakozás, a hozzájárulás visszavonása, panasz a NAIH-nál.',
        'A teljes tájékoztató szövege a felülvizsgálat után kerül ide.',
      ].join('\n\n'),
    ),
    questions: [
      {
        id: 'privacyRead',
        label: 'Az adatkezelési tájékoztatót megismertem.',
        type: 'ACCEPT',
        required: true,
      },
    ],
  },
  {
    key: 'guest-profile',
    version: 1,
    title: 'Személyes adatok',
    kind: 'PROFILE',
    scope: 'COMMON',
    order: 20,
    requiresSignature: false,
    legalReviewPending: false,
    bodyText: 'Kérjük, add meg az adataidat. A csillaggal jelölt mezők kitöltése kötelező.',
    questions: [
      { id: 'lastName', label: 'Vezetéknév', type: 'TEXT', required: true, profileField: 'lastName' },
      { id: 'firstName', label: 'Keresztnév', type: 'TEXT', required: true, profileField: 'firstName' },
      { id: 'birthDate', label: 'Születési dátum', type: 'DATE', required: true, profileField: 'birthDate' },
      { id: 'phone', label: 'Telefonszám', type: 'PHONE', required: true, profileField: 'phone' },
      { id: 'email', label: 'E-mail cím', type: 'EMAIL', required: true, profileField: 'email' },
      {
        id: 'gender',
        label: 'Nem',
        type: 'SINGLE_CHOICE',
        required: true,
        profileField: 'gender',
        help: 'A csak nőknek szóló szolgáltatásokhoz (női köredzés) szükséges.',
        options: [
          { value: Gender.FEMALE, label: 'Nő' },
          { value: Gender.MALE, label: 'Férfi' },
          { value: Gender.UNSPECIFIED, label: 'Nem adom meg' },
        ],
      },
    ],
  },
  {
    key: 'health-data-consent',
    version: 1,
    title: 'Hozzájárulás az egészségügyi adatok kezeléséhez',
    kind: 'HEALTH_CONSENT',
    scope: 'COMMON',
    order: 30,
    requiresSignature: true,
    legalReviewPending: true,
    bodyText: placeholder(
      'Az egészségügyi kérdőív válaszai különleges személyes adatnak minősülnek. A stúdió ezeket kizárólag a biztonságos edzés és kezelés érdekében, elkülönítve tárolja; csak az arra jogosult munkatársak láthatják, és minden megtekintésük naplózott. A hozzájárulás bármikor visszavonható, ilyenkor azonban az ellenjavallatokat igénylő szolgáltatás nem vehető igénybe.',
    ),
    questions: [
      {
        id: 'healthConsent',
        label: 'Hozzájárulok az egészségügyi adataim fenti célú kezeléséhez.',
        type: 'ACCEPT',
        required: true,
      },
    ],
  },
  {
    key: 'health-questionnaire',
    version: 1,
    title: 'Egészségügyi kérdőív',
    kind: 'HEALTH',
    scope: 'COMMON',
    order: 40,
    requiresSignature: true,
    legalReviewPending: true,
    bodyText: placeholder('Kérjük, a kérdésekre a valóságnak megfelelően válaszolj.'),
    questions: [
      yesNo(
        'surgeryLast6Weeks',
        'Volt műtéted az elmúlt 6 hétben?',
        'Friss műtét után az edzés vagy kezelés csak orvosi engedéllyel kezdhető. Kérjük, jelezd a recepción.',
      ),
      yesNo('labLast6Months', 'Volt laborvizsgálatod az elmúlt 6 hónapban?'),
      labQuestion('cholesterolTotal', 'Összkoleszterin', ['ELEVATED', 'HIGH']),
      labQuestion('cholesterolHdl', 'HDL-koleszterin', ['LOW']),
      labQuestion('cholesterolLdl', 'LDL-koleszterin', ['ELEVATED', 'HIGH']),
      labQuestion('triglyceride', 'Triglicerid', ['ELEVATED', 'HIGH']),
      {
        id: 'goals',
        label: 'Mik a céljaid?',
        type: 'MULTI_CHOICE',
        required: true,
        options: [
          { value: 'WEIGHT_LOSS', label: 'Fogyás' },
          { value: 'BODY_SHAPING', label: 'Alakformálás' },
          { value: 'FITNESS', label: 'Erőnlét, állóképesség' },
          { value: 'HEALTH', label: 'Egészségmegőrzés' },
          { value: 'REHAB', label: 'Rehabilitáció' },
          { value: 'OTHER', label: 'Egyéb' },
        ],
      },
      {
        id: 'fluidIntake',
        label: 'Mennyi folyadékot iszol naponta?',
        type: 'SINGLE_CHOICE',
        required: true,
        options: [
          { value: 'UNDER_1L', label: 'Kevesebb mint 1 liter' },
          { value: '1_2L', label: '1–2 liter' },
          { value: 'OVER_2L', label: 'Több mint 2 liter' },
        ],
      },
      {
        id: 'workType',
        label: 'Milyen jellegű a munkád?',
        type: 'SINGLE_CHOICE',
        required: true,
        options: [
          { value: 'SEDENTARY', label: 'Ülőmunka' },
          { value: 'STANDING', label: 'Állómunka' },
          { value: 'PHYSICAL', label: 'Fizikai munka' },
          { value: 'MIXED', label: 'Vegyes' },
        ],
      },
    ],
  },
  {
    key: 'circuit-contraindications',
    version: 1,
    title: 'Köredzés – ellenjavallatok (hidraulikus gépek)',
    kind: 'CONTRAINDICATIONS',
    scope: INTAKE_PACKAGE_CIRCUIT,
    order: 50,
    requiresSignature: true,
    legalReviewPending: true,
    bodyText: placeholder(
      'A köredzés hidraulikus ellenállású gépeken történik. Az alábbi kérdések helyőrzők, a végleges listát szakmai felülvizsgálat után véglegesítjük.',
    ),
    questions: [
      yesNo(
        'cardiovascular',
        'Van szív- vagy érrendszeri betegséged?',
        'Szív- vagy érrendszeri betegségnél az edzés előtt orvosi konzultáció javasolt.',
      ),
      yesNo(
        'uncontrolledBloodPressure',
        'Van kezeletlen magas vérnyomásod?',
        'Kezeletlen magas vérnyomással a terhelés csak orvosi engedéllyel javasolt.',
      ),
      yesNo(
        'jointOrSpine',
        'Van ízületi vagy gerincproblémád, friss sérülésed?',
        'Ízületi vagy gerincproblémánál az edző a gépeket a terheléshez igazítja. Jelezd az edzőnek.',
      ),
      yesNo(
        'pregnancy',
        'Várandós vagy?',
        'Várandósság alatt az edzés csak orvosi engedéllyel, egyéni terheléssel javasolt.',
      ),
    ],
  },
  {
    key: 'circuit-membership-contract',
    version: 1,
    title: 'Köredzés – tagsági szerződés',
    kind: 'CONTRACT',
    scope: INTAKE_PACKAGE_CIRCUIT,
    order: 60,
    requiresSignature: true,
    legalReviewPending: true,
    bodyText: placeholder(
      'A tagsági szerződés a stúdió meglévő 1, 3, 6 és 12 hónapos tagsági feltételei szerint jön létre. A díjfizetés, a szüneteltetés és a felmondás szabályai a hatályos általános szerződési feltételekben szerepelnek; a végleges szöveg a felülvizsgálat után kerül ide.',
    ),
    questions: [
      {
        id: 'membershipTerm',
        label: 'A tagság időtartama',
        type: 'SINGLE_CHOICE',
        required: true,
        options: [
          { value: '1', label: '1 hónap' },
          { value: '3', label: '3 hónap' },
          { value: '6', label: '6 hónap' },
          { value: '12', label: '12 hónap' },
        ],
      },
      {
        id: 'termsAccepted',
        label: 'A tagsági szerződést és az általános szerződési feltételeket elfogadom.',
        type: 'ACCEPT',
        required: true,
      },
    ],
  },
  {
    key: 'hypoxi-contraindications',
    version: 1,
    title: 'Hypoxi – ellenjavallatok',
    kind: 'CONTRAINDICATIONS',
    scope: INTAKE_PACKAGE_HYPOXI,
    order: 70,
    requiresSignature: true,
    legalReviewPending: true,
    bodyText: placeholder(
      'Eredeti generációs, vákuumos Hypoxi ülőkerékpár. A kérdések HELYŐRZŐK: a pontos gyártói ellenjavallatokat élesítés előtt szakmailag ellenőrizni kell.',
    ),
    questions: [
      yesNo(
        'venousDisease',
        'Van visszértágulatod, trombózisod vagy vérrögképződési hajlamod?',
        'Érbetegség esetén a vákuumos kezelés nem javasolt. Kérjük, egyeztess a recepción.',
      ),
      yesNo(
        'heartCondition',
        'Van szívbetegséged vagy pacemakered?',
        'Szívbetegségnél a kezelés csak orvosi engedéllyel vehető igénybe.',
      ),
      yesNo(
        'pregnancy',
        'Várandós vagy?',
        'Várandósság alatt a vákuumos kezelés nem javasolt.',
      ),
      yesNo(
        'recentSurgeryAbdomen',
        'Volt hasi vagy kismedencei műtéted az elmúlt 6 hónapban?',
        'Friss hasi műtét után a kezelés csak orvosi engedéllyel kezdhető.',
      ),
    ],
  },
  {
    key: 'hypoxi-informed-consent',
    version: 1,
    title: 'Hypoxi – tájékozott beleegyező nyilatkozat',
    kind: 'CONSENT',
    scope: INTAKE_PACKAGE_HYPOXI,
    order: 80,
    requiresSignature: true,
    legalReviewPending: true,
    bodyText: placeholder(
      'Kijelentem, hogy a Hypoxi kezelés menetéről, várható hatásáról és lehetséges kockázatairól tájékoztatást kaptam, kérdéseimre választ kaptam. A bérletet az első edzés után, személyes egyeztetéssel választom ki.',
    ),
    questions: [
      {
        id: 'informedConsent',
        label: 'A tájékoztatást megértettem, és a kezeléshez hozzájárulok.',
        type: 'ACCEPT',
        required: true,
      },
    ],
  },
  {
    key: 'marketing-consent',
    version: 1,
    title: 'Önkéntes hozzájárulások',
    kind: 'CONSENT',
    scope: 'COMMON',
    order: 90,
    requiresSignature: true,
    legalReviewPending: true,
    bodyText: placeholder(
      'Az alábbi hozzájárulások önkéntesek; a szolgáltatás igénybevétele nem függ tőlük, és bármikor visszavonhatók. A belső azonosító profilkép nem marketingcélú, azt csak a recepció látja.',
    ),
    questions: [
      {
        id: 'marketingPhotoVideo',
        label: 'Hozzájárulok, hogy a stúdió rólam készült fotót vagy videót marketingcélra felhasználja.',
        type: 'YES_NO',
        options: YES_NO,
        required: true,
      },
      {
        id: 'marketingMessages',
        label: 'Kérek a stúdiótól tájékoztató és ajánlatokat tartalmazó üzeneteket.',
        type: 'YES_NO',
        options: YES_NO,
        required: true,
      },
    ],
  },
];
