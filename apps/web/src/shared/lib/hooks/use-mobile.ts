import * as React from 'react';

// Mobil töréspont (UI-specifikáció 9.): 768 px alatt az oldalsáv kihúzható, a táblázat kártyasor.
const MOBILE_QUERY = '(max-width: 767px)';

let mobileQueryList: MediaQueryList | undefined;
const getMobileQueryList = () =>
  (mobileQueryList ??= window.matchMedia(MOBILE_QUERY));

function subscribe(onChange: () => void) {
  const mql = getMobileQueryList();
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

// Szinkron kezdőérték (nincs villanás az első rajzolásnál).
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => getMobileQueryList().matches,
    () => false,
  );
}
