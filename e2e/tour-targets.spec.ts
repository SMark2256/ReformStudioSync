import { expect, loginToReception, test } from './fixtures';

/**
 * Az oldalbemutatók célpontjai (TICKET-54): minden forgatókönyv minden kötelező (nem `optional`)
 * lépésének célpontja megvan és látszik, asztali és telefonos nézetben is.
 *
 * A lista a `apps/web/src/features/guided-tour/config/tours.ts` kötelező célpontjai; a
 * `tours.test.ts` unit teszt ugyanezt a listát várja, így ha a forgatókönyv változik, a két teszt
 * közül az egyik jelez. A Demó és a Monitorok oldalon nincs bemutató.
 */
const TOUR_TARGETS: Record<string, string[]> = {
  '/reception': [
    'reception.scan',
    'reception.search',
    'reception.last-check-in',
    'reception.today-check-ins',
    'reception.today-cash',
    'tour.help',
  ],
  '/guests': ['guests.search', 'guests.filter', 'guests.list', 'guests.new', 'tour.help'],
  '/passes': ['passes.templates', 'passes.new-template', 'passes.services', 'tour.help'],
  '/finance': [
    'finance.summary',
    'finance.record-payment',
    'finance.overdue',
    'finance.payments',
    'tour.help',
  ],
  '/news': ['news.filter', 'news.note', 'news.jira', 'tour.help'],
  '/settings': ['settings.theme', 'settings.surface', 'settings.buttons', 'settings.tours', 'tour.help'],
};

const VIEWPORTS = {
  asztali: { width: 1440, height: 900 },
  telefon: { width: 390, height: 844 },
};

test.describe('Oldalbemutatók célpontjai', () => {
  test.beforeEach(async ({ page }) => {
    // Automatizált böngészőben a fejléc „?” gombja nem jelenik meg (`navigator.webdriver`): itt
    // úgy teszünk, mintha nem az lenne, hogy a „?” gomb célpontja is ellenőrizhető legyen.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    });
    await loginToReception(page);
  });

  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`minden kötelező célpont látszik (${name} nézet)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const [path, anchors] of Object.entries(TOUR_TARGETS)) {
        await page.goto(path);
        for (const anchor of anchors) {
          await expect(
            page.locator(`[data-tour="${anchor}"]`).filter({ visible: true }).first(),
            `${path}: ${anchor}`,
          ).toBeVisible();
        }
      }
    });
  }

  test('a Demó és a Monitorok oldalon nincs „?” gomb', async ({ page }) => {
    for (const path of ['/demo', '/monitors']) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('[data-tour="tour.help"]')).toHaveCount(0);
    }
    // Ellenpróba: ugyanebben a környezetben a Vendégek oldalon megvan.
    await page.goto('/guests');
    await expect(page.locator('[data-tour="tour.help"]')).toBeVisible();
  });
});
