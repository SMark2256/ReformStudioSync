import { useEffect, useState } from 'react';

/**
 * Automatizált böngészőben (E2E, `navigator.webdriver`) se a felajánlás, se a „?” gomb nem jelenik
 * meg, hogy semmit ne takarjon el a tesztelt oldalon.
 */
export const isAutomatedBrowser = (): boolean =>
  typeof navigator !== 'undefined' && navigator.webdriver === true;

/** A bemutató buborékán kívüli nyitott párbeszédablak (modál, oldalpanel, megerősítés). */
const OTHER_DIALOG = '[role="dialog"]:not([data-tour-bubble])';

/**
 * Van-e nyitott párbeszédablak az oldalon (csak `enabled` mellett figyel). A Radix a body-ba
 * portálja az ablakait, ezért elég a body közvetlen gyerekeinek változását figyelni.
 */
export function useOtherDialogOpen(enabled: boolean): boolean {
  const [open, setOpen] = useState(
    () => !!document.querySelector(OTHER_DIALOG),
  );
  useEffect(() => {
    if (!enabled) return;
    const update = () => setOpen(!!document.querySelector(OTHER_DIALOG));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [enabled]);
  return open;
}
