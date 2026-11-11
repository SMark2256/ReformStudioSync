import type { BrowserContext, WebSocketRoute } from '@playwright/test';
import { DEFAULT_STUDIO_ID, SOCKET_EVENTS, SOCKET_NAMESPACE } from '@reform/shared';

interface StubConnection {
  route: WebSocketRoute;
  /** A kliens CONNECT csomagjának `auth` része; amíg nem érkezett meg, `null`. */
  auth: { token?: string; displayOnly?: boolean } | null;
  /** A névtérhez csatlakozott, és a szerver (stub) még nem bontotta. */
  active: boolean;
  closed: boolean;
}

interface SocketIoStubOptions {
  /**
   * A valódi gatewayhez hasonlóan minden elfogadott csatlakozás és bontás után
   * `MONITOR_STATE`-et küld az élő klienseknek (alapból igen). `false`-szal a kliens
   * „csatlakozott, de a szerver még nem léptette be” állapotban marad (TICKET-32).
   */
  announceState?: boolean;
  /**
   * Ha meg van adva, minden csatlakozást elutasít: a CONNECT válasz után ezzel a
   * kóddal `MONITOR_AUTH_REJECTED`-et küld, majd bont, mint a gateway (TICKET-31).
   */
  rejectWith?: string;
}

const CONNECT_PREFIX = `40${SOCKET_NAMESPACE},`;
const DISCONNECT_PACKET = `41${SOCKET_NAMESPACE},`;
const EVENT_PREFIX = `42${SOCKET_NAMESPACE},`;

/**
 * Minimális socket.io (engine.io v4) szerver a böngészőkontextus WebSocketjeire (TICKET-29).
 *
 * Az E2E build a socketet is az elérhetetlen `VITE_WS_URL`-re nyitná; a `routeWebSocket` ezt a
 * böngészőben elkapja (a popup ablakokban is), így API nélkül mérhető, hány kapcsolat nyílik, és
 * szerveroldali esemény küldhető. Csak a használt csomagokat ismeri: open (`0`), névtér-CONNECT
 * (`40`), névtér-bontás (`41`), ping (`2` → `3`), esemény (`42`). A többi kliensüzenetet
 * (pl. `monitor:ping`) elnyeli.
 */
export async function installSocketIoStub(
  context: BrowserContext,
  { announceState = true, rejectWith }: SocketIoStubOptions = {},
) {
  const connections: StubConnection[] = [];

  const sendEvent = (connection: StubConnection, event: string, payload: unknown) =>
    connection.route.send(`${EVENT_PREFIX}${JSON.stringify([event, payload])}`);

  /** A gateway `broadcastMonitorState`-je: a kijelzőszám csak a kijelzőket számolja. */
  const broadcastState = () => {
    if (!announceState) return;
    const live = connections.filter((c) => c.active);
    const connectedDisplays = live.filter((c) => c.auth?.displayOnly === true).length;
    for (const connection of live) {
      sendEvent(connection, SOCKET_EVENTS.MONITOR_STATE, { studioId: DEFAULT_STUDIO_ID, connectedDisplays });
    }
  };

  await context.routeWebSocket(/\/socket\.io\//, (route) => {
    const sid = `stub-${connections.length + 1}`;
    const connection: StubConnection = { route, auth: null, active: false, closed: false };
    connections.push(connection);

    route.onMessage((message) => {
      const text = message.toString();
      if (text === '2') {
        route.send('3');
      } else if (text.startsWith(CONNECT_PREFIX)) {
        connection.auth = JSON.parse(text.slice(CONNECT_PREFIX.length) || '{}') as StubConnection['auth'];
        route.send(`${CONNECT_PREFIX}${JSON.stringify({ sid })}`);
        if (rejectWith) {
          sendEvent(connection, SOCKET_EVENTS.MONITOR_AUTH_REJECTED, {
            code: rejectWith,
            message: 'Elutasítva (E2E stub).',
            timestamp: new Date().toISOString(),
          });
          route.send(DISCONNECT_PACKET);
          return;
        }
        connection.active = true;
        broadcastState();
      } else if (text === DISCONNECT_PACKET && connection.active) {
        connection.active = false;
        broadcastState();
      }
    });
    route.onClose(() => {
      const wasActive = connection.active;
      connection.active = false;
      connection.closed = true;
      if (wasActive) broadcastState();
    });

    route.send(
      `0${JSON.stringify({ sid, upgrades: [], pingInterval: 25_000, pingTimeout: 20_000, maxPayload: 1_000_000 })}`,
    );
  });

  /** Kijelző (`displayOnly`) vagy munkatársi kapcsolat. */
  const isKind = (connection: StubConnection, displayOnly: boolean) =>
    connection.auth !== null && connection.auth.displayOnly === displayOnly;

  const liveOfKind = (displayOnly: boolean) =>
    connections.filter((c) => c.active && isKind(c, displayOnly));

  return {
    /** Az eddig megnyitott (bontottakat is beleértve) WebSocket-kapcsolatok száma. */
    openedCount: () => connections.length,
    closedCount: () => connections.filter((c) => c.closed).length,
    /** A névtérhez csatlakozott kapcsolatok száma fajtánként. */
    countByKind: (displayOnly: boolean) => connections.filter((c) => isKind(c, displayOnly)).length,
    /** Szerveroldali esemény az élő, adott fajtájú kapcsolatoknak. */
    emit(event: string, payload: unknown, displayOnly: boolean) {
      for (const connection of liveOfKind(displayOnly)) sendEvent(connection, event, payload);
    },
    /**
     * Szerveroldali bontás (`socket.disconnect(true)`) az élő, adott fajtájú kapcsolatoknak
     * (pl. visszavont párosítás után). A kliens ilyenkor magától nem csatlakozik újra.
     */
    disconnect(displayOnly: boolean) {
      for (const connection of liveOfKind(displayOnly)) {
        connection.active = false;
        connection.route.send(DISCONNECT_PACKET);
      }
      broadcastState();
    },
  };
}
