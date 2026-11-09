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

  private clientStudios = new Map<string, string>();
  private clientDevices = new Map<string, string>();

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
    for (const dId of this.clientDevices.values()) {
      if (dId === deviceId) return true;
    }
    return false;
  }

  getOnlineDeviceIds(): Set<string> {
    return new Set(this.clientDevices.values());
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
      const studioId = validated.studioId;

      const room = this.getRoomName(studioId);
      await client.join(room);
      // A munkatársi tokennel megnyitott Vendégmonitor (`displayOnly`) sem kap
      // teljes eredményt. A jelző csak szűkíthet, jogosultságot nem ad.
      const displayOnly = client.handshake.auth?.displayOnly === true;
      if (validated.type === 'STAFF' && !displayOnly) {
        await client.join(this.getStaffRoomName(studioId));
      }
      this.clientStudios.set(client.id, studioId);
      if (validated.type === 'DEVICE' && validated.deviceId) {
        this.clientDevices.set(client.id, validated.deviceId);
      }
      this.broadcastMonitorState(studioId);
    } catch (err) {
      const error = toAppError(err);
      this.logger.warn(
        `Monitor socket connection rejected (${client.id}): ${error.code} ${error.message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const studioId = this.clientStudios.get(client.id) ?? DEFAULT_STUDIO_ID;
    this.clientStudios.delete(client.id);
    this.clientDevices.delete(client.id);
    this.broadcastMonitorState(studioId);
  }

  @SubscribeMessage(SOCKET_EVENTS.MONITOR_PING)
  async handlePing(@ConnectedSocket() client: Socket): Promise<MonitorStatePayload> {
    const studioId = this.clientStudios.get(client.id) ?? DEFAULT_STUDIO_ID;
    const deviceId = this.clientDevices.get(client.id);
    if (deviceId) {
      await this.authService
        .recordDeviceActivity(deviceId, 'Élő kapcsolat (Heartbeat)')
        .catch(() => {});
    }
    return this.getMonitorState(studioId);
  }

  getMonitorState(studioId = DEFAULT_STUDIO_ID): MonitorStatePayload {
    let connectedDisplays = 0;
    for (const sId of this.clientStudios.values()) {
      if (sId === studioId) connectedDisplays++;
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
    for (const [clientId, deviceId] of this.clientDevices.entries()) {
      if (this.clientStudios.get(clientId) === studioId) {
        this.authService
          .recordDeviceActivity(
            deviceId,
            `Beléptetés megjelenítve (${payload.guestName})`,
          )
          .catch(() => {});
      }
    }
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

    for (const [clientId, deviceId] of this.clientDevices.entries()) {
      if (this.clientStudios.get(clientId) === studioId) {
        this.authService
          .recordDeviceActivity(
            deviceId,
            `Sztornó megjelenítve (${payload.guestName})`,
          )
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
