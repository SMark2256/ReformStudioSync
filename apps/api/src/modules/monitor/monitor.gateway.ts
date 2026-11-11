import { forwardRef, Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  DEFAULT_STUDIO_ID,
  MonitorDeviceRevokedPayload,
  MonitorStatePayload,
  MonitorTestPingPayload,
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
  toAppError,
  toMonitorPayload,
  toMonitorRevokedPayload,
} from '@reform/shared';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';

/** Egy hitelesített, regisztrált socket-kliens. */
interface MonitorClient {
  studioId: string;
  /** Párosított kijelző eszköze (csak DEVICE tokennél). */
  deviceId?: string;
  /**
   * Kijelző: DEVICE token, vagy munkatársi tokennel megnyitott Vendégmonitor
   * (`displayOnly`). A recepciós fül nem kijelző.
   */
  isDisplay: boolean;
}

@WebSocketGateway({
  namespace: SOCKET_NAMESPACE,
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class MonitorGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(MonitorGateway.name);

  @WebSocketServer()
  server: Server;

  /** Socket-azonosító → kliens. Csak a csatlakozás végén, még élő kliens kerül ide. */
  private clients = new Map<string, MonitorClient>();

  constructor(
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  /** A stúdió minden kliense (munkatárs és párosított kijelző). */
  private getRoomName(studioId: string): string {
    return `studio:${studioId}`;
  }

  /**
   * Csak munkatársi (STAFF) tokennel csatlakozott kliensek. A teljes beléptetési
   * eredmény (tartozás, vonalkód, ok) kizárólag ide mehet, párosított kijelzőre nem.
   */
  private getStaffRoomName(studioId: string): string {
    return `${this.getRoomName(studioId)}:staff`;
  }

  isDeviceOnline(deviceId: string): boolean {
    for (const entry of this.clients.values()) {
      if (entry.deviceId === deviceId) return true;
    }
    return false;
  }

  getOnlineDeviceIds(): Set<string> {
    const ids = new Set<string>();
    for (const { deviceId } of this.clients.values()) {
      if (deviceId) ids.add(deviceId);
    }
    return ids;
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.headers?.authorization?.replace('Bearer ', '') ?? '');

      if (!token) {
        this.logger.warn(
          `Monitor socket connection rejected (${client.id}): Hiányzó hitelesítő token.`,
        );
        client.disconnect(true);
        return;
      }

      const validated = await this.authService.validateSocketToken(token);
      // A hitelesítés alatt a kliens bonthatott: a `handleDisconnect` ilyenkor már
      // lefutott, így a most beírt bejegyzés soha nem törlődne.
      if (client.disconnected) return;

      const studioId = validated.studioId;
      // A munkatársi tokennel megnyitott Vendégmonitor (`displayOnly`) sem kap
      // teljes eredményt. A jelző csak szűkíthet, jogosultságot nem ad.
      const displayOnly = client.handshake.auth?.displayOnly === true;
      const isStaffDesk = validated.type === 'STAFF' && !displayOnly;
      const rooms = [this.getRoomName(studioId)];
      if (isStaffDesk) rooms.push(this.getStaffRoomName(studioId));
      for (const room of rooms) {
        await client.join(room);
      }
      if (client.disconnected) {
        // A bontáskori takarítás már lefutott, a szobatagságot mi bontjuk.
        for (const room of rooms) {
          await client.leave(room);
        }
        return;
      }

      this.clients.set(client.id, {
        studioId,
        deviceId: validated.type === 'DEVICE' ? validated.deviceId : undefined,
        isDisplay: !isStaffDesk,
      });
      this.broadcastMonitorState(studioId);
    } catch (err) {
      const error = toAppError(err);
      this.logger.warn(
        `Monitor socket connection rejected (${client.id}): ${error.code} ${error.message}`,
      );
      client.disconnect(true);
    }
  }

  /** Idempotens: nem regisztrált (pl. elutasított) kliensnél nincs teendő. */
  handleDisconnect(client: Socket) {
    const entry = this.clients.get(client.id);
    if (!entry) return;
    this.clients.delete(client.id);
    this.broadcastMonitorState(entry.studioId);
  }

  @SubscribeMessage(SOCKET_EVENTS.MONITOR_PING)
  async handlePing(@ConnectedSocket() client: Socket): Promise<MonitorStatePayload> {
    const entry = this.clients.get(client.id);
    const studioId = entry?.studioId ?? DEFAULT_STUDIO_ID;
    const deviceId = entry?.deviceId;
    if (deviceId) {
      await this.authService
        .recordDeviceActivity(deviceId, 'Élő kapcsolat (Heartbeat)')
        .catch(() => {});
    }
    return this.getMonitorState(studioId);
  }

  /** `connectedDisplays`: a stúdió kapcsolódó kijelzői, recepciós fülek nélkül. */
  getMonitorState(studioId = DEFAULT_STUDIO_ID): MonitorStatePayload {
    let connectedDisplays = 0;
    for (const entry of this.clients.values()) {
      if (entry.studioId === studioId && entry.isDisplay) connectedDisplays++;
    }

    return {
      studioId,
      connectedDisplays,
      lastHeartbeat: new Date().toISOString(),
    };
  }

  broadcastMonitorState(studioId = DEFAULT_STUDIO_ID) {
    if (!this.server) return;
    const payload = this.getMonitorState(studioId);
    this.server
      .to(this.getRoomName(studioId))
      .emit(SOCKET_EVENTS.MONITOR_STATE, payload);
  }

  emitCheckInResult(
    payload: CheckInResultPayload,
    studioId = DEFAULT_STUDIO_ID,
  ) {
    if (!this.server) return;
    this.server
      .to(this.getStaffRoomName(studioId))
      .emit(SOCKET_EVENTS.CHECKIN_RESULT, payload);
    // A munkatársi kliensek a teljes eseményt kapják, a szűkítettet nem.
    this.server
      .to(this.getRoomName(studioId))
      .except(this.getStaffRoomName(studioId))
      .emit(SOCKET_EVENTS.MONITOR_CHECKIN_RESULT, toMonitorPayload(payload));

    // Frissítjük az aktív online kijelzők utolsó aktivitását
    this.recordStudioDeviceActivity(
      studioId,
      `Beléptetés megjelenítve (${payload.guestName})`,
    );
  }

  emitCheckInRevoked(
    payload: CheckInRevokedPayload,
    studioId = DEFAULT_STUDIO_ID,
  ) {
    if (!this.server) return;
    this.server
      .to(this.getStaffRoomName(studioId))
      .emit(SOCKET_EVENTS.CHECKIN_REVOKED, payload);
    this.server
      .to(this.getRoomName(studioId))
      .except(this.getStaffRoomName(studioId))
      .emit(
        SOCKET_EVENTS.MONITOR_CHECKIN_REVOKED,
        toMonitorRevokedPayload(payload),
      );

    this.recordStudioDeviceActivity(
      studioId,
      `Sztornó megjelenítve (${payload.guestName})`,
    );
  }

  private recordStudioDeviceActivity(studioId: string, activity: string) {
    for (const entry of this.clients.values()) {
      if (entry.deviceId && entry.studioId === studioId) {
        this.authService
          .recordDeviceActivity(entry.deviceId, activity)
          .catch(() => {});
      }
    }
  }

  emitTestPing(payload: MonitorTestPingPayload, studioId = DEFAULT_STUDIO_ID) {
    if (!this.server) return;
    this.server
      .to(this.getRoomName(studioId))
      .emit(SOCKET_EVENTS.MONITOR_TEST_PING, payload);
  }

  emitDeviceRevoked(
    payload: MonitorDeviceRevokedPayload,
    studioId = DEFAULT_STUDIO_ID,
  ) {
    if (!this.server) return;
    this.server
      .to(this.getRoomName(studioId))
      .emit(SOCKET_EVENTS.MONITOR_DEVICE_REVOKED, payload);
  }
}
