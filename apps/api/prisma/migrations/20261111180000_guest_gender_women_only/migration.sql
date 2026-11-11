-- TICKET-42: a vendég neme, a csak nőknek szóló szolgáltatás (női köredzés) és a havi tagság
-- szolgáltatása. Férfi vendégnek csak nőknek szóló bérlet / tagság nem adható el, és vele nem
-- léptethető be (a szabály a közös `womenOnlyAccess`, packages/shared/src/gender.ts).

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'UNSPECIFIED');

-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "gender" "Gender" NOT NULL DEFAULT 'UNSPECIFIED';

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "women_only" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "service_id" TEXT;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Adatátvezetés 1: a meglévő vendégek neme a keresztnév alapján, ugyanazzal a névlistával és
-- normalizálással, mint az `inferGenderFromFirstName` (első tag, kisbetű, ékezet nélkül). Amit
-- nem ismer fel (pl. „Élő”), „nincs megadva” (UNSPECIFIED) marad. A listák egyezését az API
-- `gender.spec.ts` tesztje ellenőrzi.
-- FEMALE_FIRST_NAMES
UPDATE "guests" SET "gender" = 'FEMALE'
WHERE translate(
  lower(regexp_replace(btrim("first_name"), '[[:space:]-].*$', '')),
  'ÁÉÍÓÖŐÚÜŰáéíóöőúüű',
  'aeiooouuuaeiooouuu'
) IN (
  'adel', 'adrienn', 'agnes', 'agota', 'alexandra', 'aliz', 'amalia', 'andrea', 'angela',
  'aniko', 'anita', 'anna', 'aranka', 'barbara', 'beata', 'beatrix', 'bernadett', 'bettina',
  'bianka', 'boglarka', 'borbala', 'boroka', 'brigitta', 'cecilia', 'cintia', 'csenge',
  'csilla', 'dalma', 'diana', 'dominika', 'dora', 'dorina', 'dorka', 'dorottya', 'edina',
  'edit', 'eleonora', 'ella', 'emese', 'emilia', 'emma', 'eniko', 'erika', 'erzsebet',
  'eszter', 'etelka', 'eva', 'evelin', 'fanni', 'flora', 'franciska', 'fruzsina', 'gabriella',
  'georgina', 'gizella', 'greta', 'gyongyi', 'hajnalka', 'hanna', 'hedvig', 'helga',
  'henrietta', 'ibolya', 'ildiko', 'ilona', 'iren', 'irma', 'ivett', 'izabella', 'janka',
  'jazmin', 'johanna', 'jolan', 'judit', 'julia', 'julianna', 'kamilla', 'karolina', 'kata',
  'katalin', 'kinga', 'kincso', 'kitti', 'klara', 'klaudia', 'kornelia', 'kriszta',
  'krisztina', 'lara', 'laura', 'lea', 'lena', 'lenke', 'lili', 'liliana', 'lilla', 'linda',
  'livia', 'luca', 'lujza', 'magdolna', 'maja', 'margit', 'maria', 'mariann', 'marianna',
  'marietta', 'marta', 'melinda', 'mira', 'monika', 'natalia', 'nikoletta', 'nikolett',
  'noemi', 'nora', 'olga', 'orsolya', 'panna', 'patricia', 'petra', 'piroska', 'ramona',
  'rebeka', 'regina', 'reka', 'renata', 'rita', 'roza', 'rozalia', 'sara', 'sarolta',
  'szabina', 'szilvia', 'szofia', 'szonja', 'tamara', 'terez', 'teodora', 'timea', 'tunde',
  'valentina', 'valeria', 'vanda', 'vera', 'veronika', 'viktoria', 'vilma', 'viola', 'virag',
  'vivien', 'zita', 'zoe', 'zsanett', 'zsofi', 'zsofia', 'zsuzsa', 'zsuzsanna'
);

-- MALE_FIRST_NAMES
UPDATE "guests" SET "gender" = 'MALE'
WHERE translate(
  lower(regexp_replace(btrim("first_name"), '[[:space:]-].*$', '')),
  'ÁÉÍÓÖŐÚÜŰáéíóöőúüű',
  'aeiooouuuaeiooouuu'
) IN (
  'abel', 'adam', 'adrian', 'akos', 'albert', 'alex', 'andor', 'andras', 'antal', 'arnold',
  'aron', 'arpad', 'attila', 'balazs', 'balint', 'barna', 'barnabas', 'bela', 'bence',
  'benedek', 'benjamin', 'bertalan', 'botond', 'csaba', 'csongor', 'daniel', 'david', 'denes',
  'dezso', 'dominik', 'domonkos', 'ede', 'elek', 'elemer', 'emil', 'endre', 'erik', 'erno',
  'ervin', 'ferenc', 'gabor', 'gaspar', 'gellert', 'gergely', 'gergo', 'geza', 'gusztav',
  'gyorgy', 'gyula', 'henrik', 'hunor', 'ignac', 'imre', 'istvan', 'ivan', 'jakab', 'janos',
  'jeno', 'jozsef', 'kalman', 'karoly', 'kende', 'kevin', 'kolos', 'kornel', 'kristof',
  'krisztian', 'lajos', 'laszlo', 'levente', 'lorand', 'lorant', 'lorinc', 'marcell', 'mario',
  'mark', 'martin', 'marton', 'mate', 'matyas', 'menyhert', 'mihaly', 'miklos', 'milan',
  'nandor', 'nimrod', 'noel', 'norbert', 'oliver', 'otto', 'pal', 'patrik', 'peter', 'rezso',
  'richard', 'robert', 'roland', 'rudolf', 'samuel', 'sandor', 'sebestyen', 'simon',
  'szabolcs', 'szilard', 'szilveszter', 'tamas', 'tibor', 'tivadar', 'vencel', 'viktor',
  'vilmos', 'vince', 'zalan', 'zoltan', 'zsigmond', 'zsolt', 'zsombor'
);

-- Adatátvezetés 2: a köredzés (CIRCUIT kategóriájú „Köredzés” / „Női köredzés”) szolgáltatás csak nőknek szól.
UPDATE "services" SET "women_only" = true
WHERE "category" = 'CIRCUIT'
  AND translate(lower("name"), 'ÁÉÍÓÖŐÚÜŰáéíóöőúüű', 'aeiooouuuaeiooouuu') LIKE '%koredzes%';

-- Adatátvezetés 3: a meglévő havi tagságok a stúdió köredzés szolgáltatásához kötődnek
-- (`pickCircuitMembershipService`: CIRCUIT kategória, az aktív elöl, azon belül a legrégebbi).
UPDATE "memberships" AS m SET "service_id" = (
  SELECT s."id" FROM "services" AS s
  WHERE s."studio_id" = m."studio_id" AND s."category" = 'CIRCUIT'
  ORDER BY s."is_active" DESC, s."created_at" ASC
  LIMIT 1
)
WHERE m."service_id" IS NULL;
