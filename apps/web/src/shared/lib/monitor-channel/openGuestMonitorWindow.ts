import { APP_ROUTES } from '@/shared/config';
import { notify } from '@/shared/lib/notify';

// A Vendégmonitor a pult felé néző kijelzőre kerül, ezért külön (névvel azonosított) ablakban
// nyílik: újbóli megnyitáskor ugyanaz az ablak kerül előre.
export const openGuestMonitorWindow = () => {
  window.open(
    APP_ROUTES.monitor.path,
    'ReformStudioGuestMonitor',
    'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no',
  );
  notify.info(
    'Másodlagos Vendégmonitor ablak megnyitva',
    'Húzd át az ablakot a pult felé néző kijelzőre és nyomj Teljes Képernyőt.',
  );
};
