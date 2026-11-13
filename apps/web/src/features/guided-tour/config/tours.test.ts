import { TOUR_ID_PATTERN } from '@reform/shared';
import { describe, expect, it } from 'vitest';
import { RELEASE_NOTES, type ReleaseNote } from '@/entities/release-note';
import { APP_ROUTES } from '@/shared/config';
import { findSpotlight, findTour, TOURS } from './tours';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('findTour', () => {
  it('a Demó és a Monitorok oldalon nincs bemutató', () => {
    expect(findTour(APP_ROUTES.demo.path)).toBeNull();
    expect(findTour(APP_ROUTES.monitors.path)).toBeNull();
  });

  it('a többi alkalmazásoldalon van, kis- és nagybetűtől, záró perjeltől függetlenül', () => {
    for (const route of [
      APP_ROUTES.reception,
      APP_ROUTES.guests,
      APP_ROUTES.passes,
      APP_ROUTES.finance,
      APP_ROUTES.news,
      APP_ROUTES.settings,
    ]) {
      expect(findTour(route.path), route.path).not.toBeNull();
      expect(findTour(`${route.path.toUpperCase()}/`), route.path).not.toBeNull();
    }
  });

  it('az azonosítók egyediek, és a szerver elfogadja őket', () => {
    const ids = Object.values(TOURS).map((tour) => tour.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(TOUR_ID_PATTERN);
  });

  // Az `e2e/tour-targets.spec.ts` ugyanezt a listát ellenőrzi a böngészőben: ha itt változik,
  // ott is frissíteni kell.
  it('a kötelező célpontok listája egyezik az E2E-ével', () => {
    const anchors = Object.fromEntries(
      Object.entries(TOURS).map(([path, tour]) => [
        path,
        tour.steps
          .filter((step) => step.target && !step.optional)
          .map((step) => step.target),
      ]),
    );
    expect(anchors).toEqual({
      '/reception': [
        '[data-tour="reception.scan"]',
        '[data-tour="reception.search"]',
        '[data-tour="reception.last-check-in"]',
        '[data-tour="reception.today-check-ins"]',
        '[data-tour="reception.today-cash"]',
        '[data-tour="tour.help"]',
      ],
      '/guests': [
        '[data-tour="guests.search"]',
        '[data-tour="guests.filter"]',
        '[data-tour="guests.list"]',
        '[data-tour="guests.new"]',
        '[data-tour="tour.help"]',
      ],
      '/passes': [
        '[data-tour="passes.templates"]',
        '[data-tour="passes.new-template"]',
        '[data-tour="passes.services"]',
        '[data-tour="tour.help"]',
      ],
      '/finance': [
        '[data-tour="finance.summary"]',
        '[data-tour="finance.record-payment"]',
        '[data-tour="finance.overdue"]',
        '[data-tour="finance.payments"]',
        '[data-tour="tour.help"]',
      ],
      '/news': [
        '[data-tour="news.filter"]',
        '[data-tour="news.note"]',
        '[data-tour="news.jira"]',
        '[data-tour="tour.help"]',
      ],
      '/settings': [
        '[data-tour="settings.theme"]',
        '[data-tour="settings.surface"]',
        '[data-tour="settings.buttons"]',
        '[data-tour="settings.tours"]',
        '[data-tour="tour.help"]',
      ],
    });
  });
});

describe('findSpotlight', () => {
  const note: ReleaseNote = {
    id: 'v0.3-spotlight-test',
    version: '0.3',
    date: '2026-11-01',
    kind: 'IMPROVEMENT',
    title: 'Próba újdonság',
    summary: 'Próba.',
    jiraKey: 'TICKET-54',
    spotlight: { path: '/guests', target: 'guests.search', text: 'Itt van.' },
  };
  const day = (n: number) => Date.parse(note.date) + n * DAY_MS;

  it('a friss újdonság egy lépésben, a célpontjával jelenik meg', () => {
    const tour = findSpotlight('/Guests/', [note], day(3));
    expect(tour).toEqual({
      id: 'spotlight:v0.3-spotlight-test',
      steps: [
        {
          target: '[data-tour="guests.search"]',
          title: 'Próba újdonság',
          text: 'Itt van.',
        },
      ],
    });
    expect(tour?.id).toMatch(TOUR_ID_PATTERN);
  });

  it('45 nap után és más oldalon nincs', () => {
    expect(findSpotlight('/guests', [note], day(45))).not.toBeNull();
    expect(findSpotlight('/guests', [note], day(46))).toBeNull();
    expect(findSpotlight('/finance', [note], day(3))).toBeNull();
  });

  it('a bejegyzések reflektorainak azonosítóját a szerver elfogadja', () => {
    for (const n of RELEASE_NOTES.filter((n) => n.spotlight)) {
      expect(`spotlight:${n.id}`).toMatch(TOUR_ID_PATTERN);
    }
  });
});
