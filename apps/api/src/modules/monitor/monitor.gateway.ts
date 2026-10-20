import { Logger } from '@nestjs/common';
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
  MonitorStatePayload,
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
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

  constructor(private readonly authService: AuthService) {}

  private getRoomName(studioId: string): string {
    return `studio:${studioId}`;
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.headers?.authorization?.replace('Bearer ', '') ?? '');

      let studioId = DEFAULT_STUDIO_ID;

      if (token) {
        const validated = await this.authService.validateSocketToken(token);
        studioId = validated.studioId;
      }

      const room = this.getRoomName(studioId);
      await client.join(room);
      this.clientStudios.set(client.id, studioId);
      this.broadcastMonitorState(studioId);
    } catch (err) {
      this.logger.warn(
        `Monitor socket connection rejected (${client.id}): ${(err as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const studioId = this.clientStudios.get(client.id) ?? DEFAULT_STUDIO_ID;
    this.clientStudios.delete(client.id);
    this.broadcastMonitorState(studioId);
  }

  @SubscribeMessage(SOCKET_EVENTS.MONITOR_PING)
  handlePing(@ConnectedSocket() client: Socket): MonitorStatePayload {
    const studioId = this.clientStudios.get(client.id) ?? DEFAULT_STUDIO_ID;
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
      .to(this.getRoomName(studioId))
      .emit(SOCKET_EVENTS.CHECKIN_RESULT, payload);
  }

  emitCheckInRevoked(
    payload: CheckInRevokedPayload,
    studioId = DEFAULT_STUDIO_ID,
  ) {
    if (!this.server) return;
    this.server
      .to(this.getRoomName(studioId))
      .emit(SOCKET_EVENTS.CHECKIN_REVOKED, payload);
  }
}
