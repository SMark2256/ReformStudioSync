import { isBirthdayToday } from "@reform/shared";
import { describe, expect, it } from "vitest";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("isBirthdayToday — születésnap a stúdió naptára szerint (TICKET-36)", () => {
  it("a hónap-napot hasonlítja, az évtől függetlenül (Date és YYYY-MM-DD is)", () => {
    const now = new Date("2026-11-11T09:00:00Z");
    expect(isBirthdayToday(day("1991-11-11"), now)).toBe(true);
    expect(isBirthdayToday("1991-11-11", now)).toBe(true);
    expect(isBirthdayToday(day("1991-11-12"), now)).toBe(false);
    expect(isBirthdayToday(day("1991-12-11"), now)).toBe(false);
  });

  it("a mai napot Europe/Budapest időzónában számolja (éjfél körüli határ)", () => {
    // UTC 23:30 = budapesti 00:30 másnap (téli idő, UTC+1).
    const justAfterMidnight = new Date("2026-11-10T23:30:00Z");
    expect(isBirthdayToday(day("1991-11-11"), justAfterMidnight)).toBe(true);
    expect(isBirthdayToday(day("1991-11-10"), justAfterMidnight)).toBe(false);
    // Nyári idő (UTC+2): UTC 22:30 = budapesti 00:30 másnap.
    const summer = new Date("2026-07-14T22:30:00Z");
    expect(isBirthdayToday(day("1990-07-15"), summer)).toBe(true);
  });

  it("február 29-i születésnap nem szökőévben február 28-án, szökőévben 29-én számít", () => {
    expect(
      isBirthdayToday(day("2000-02-29"), new Date("2027-02-28T10:00:00Z")),
    ).toBe(true);
    expect(
      isBirthdayToday(day("2000-02-29"), new Date("2027-03-01T10:00:00Z")),
    ).toBe(false);
    expect(
      isBirthdayToday(day("2000-02-29"), new Date("2028-02-29T10:00:00Z")),
    ).toBe(true);
    expect(
      isBirthdayToday(day("2000-02-29"), new Date("2028-02-28T10:00:00Z")),
    ).toBe(false);
  });

  it("hiányzó születési dátumnál false", () => {
    expect(isBirthdayToday(null)).toBe(false);
    expect(isBirthdayToday(undefined)).toBe(false);
  });
});
