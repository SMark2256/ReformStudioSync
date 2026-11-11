import type { BrowserContext, WebSocketRoute } from '@playwright/test';
import { SOCKET_NAMESPACE } from '@reform/shared';

interface StubConnection {
  route: WebSocketRoute;
  /** A kliens CONNECT csomagjának `auth` része; amíg nem érkezett meg, `null`. */
  auth: { token?: string; displayOnly?: boolean } | null;
  closed: boolean;
}

const CONNECT_PREFIX = `40${SOCKET_NAMESPACE},`;
const EVENT_PREFIX = `42${SOCKET_NAMESPACE},`;

/**
 * Minimális socket.io (engine.io v4) szerver a böngészőkontextus WebSocketjeire (TICKET-29).
 *
 * Az E2E build a socketet is az elérhetetlen `VITE_WS_URL`-re nyitná; a `routeWebSocket` ezt a
 * böngészőben elkapja (a popup ablakokban is), így API nélkül mérhető, hány kapcsolat nyílik, és
 * szerveroldali esemény küldhető. Csak a használt csomagokat ismeri: open (`0`), névtér-CONNECT
 * (`40`), ping (`2` → `3`), esemény (`42`). A többi kliensüzenetet (pl. `monitor:ping`) elnyeli.
 */
export async function installSocketIoStub(context: BrowserContext) {
  const connections: StubConnection[] = [];

  await context.routeWebSocket(/\/socket\.io\//, (route) => {
    const sid = `stub-${connections.length + 1}`;
    const connection: StubConnection = { route, auth: null, closed: false };
    connections.push(connection);

    route.onMessage((message) => {
      const text = message.toString();
      if (text === '2') {
        route.send('3');
      } else if (text.startsWith(CONNECT_PREFIX)) {
        connection.auth = JSON.parse(text.slice(CONNECT_PREFIX.length) || '{}') as StubConnection['auth'];
        route.send(`${CONNECT_PREFIX}${JSON.stringify({ sid })}`);
      }
    });
    route.onClose(() => {
      connection.closed = true;
    });

    route.send(
      `0${JSON.stringify({ sid, upgrades: [], pingInterval: 25_000, pingTimeout: 20_000, maxPayload: 1_000_000 })}`,
    );
  });

  /** Kijelző (`displayOnly`) vagy munkatársi kapcsolat. */
  const isKind = (connection: StubConnection, displayOnly: boolean) =>
    connection.auth !== null && connection.auth.displayOnly === displayOnly;

  return {
    /** Az eddig megnyitott (bontottakat is beleértve) WebSocket-kapcsolatok száma. */
    openedCount: () => connections.length,
    closedCount: () => connections.filter((c) => c.closed).length,
    /** A névtérhez csatlakozott kapcsolatok száma fajtánként. */
    countByKind: (displayOnly: boolean) => connections.filter((c) => isKind(c, displayOnly)).length,
    /** Szerveroldali esemény az élő, adott fajtájú kapcsolatoknak. */
    emit(event: string, payload: unknown, displayOnly: boolean) {
      for (const connection of connections) {
        if (!connection.closed && isKind(connection, displayOnly)) {
          connection.route.send(`${EVENT_PREFIX}${JSON.stringify([event, payload])}`);
        }
      }
    },
  };
}
