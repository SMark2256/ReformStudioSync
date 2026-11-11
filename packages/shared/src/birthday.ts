import { getStudioDate } from "./membership-dues";

/**
 * Születésnapos-e a vendég az adott napon a stúdió naptára (Europe/Budapest) szerint.
 * Tiszta függvény: az API és a kliensoldali mock motor ugyanezt használja.
 *
 * A `birthDate` dátum jellegű érték (UTC éjfél vagy `YYYY-MM-DD`), ezért a hónap-napot
 * a tárolt formából olvassuk, nem időzóna-átváltással. Február 29-i születésnap
 * nem szökőévben február 28-án számít.
 */
export function isBirthdayToday(
  birthDate: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!birthDate) return false;
  const iso =
    typeof birthDate === "string" ? birthDate : birthDate.toISOString();
  const birthMonth = Number(iso.slice(5, 7));
  const birthDay = Number(iso.slice(8, 10));
  if (!birthMonth || !birthDay) return false;

  const today = getStudioDate(now);
  if (birthMonth === 2 && birthDay === 29 && !isLeapYear(today.year)) {
    return today.month === 2 && today.day === 28;
  }
  return today.month === birthMonth && today.day === birthDay;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
