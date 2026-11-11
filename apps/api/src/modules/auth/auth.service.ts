import {
  forwardRef,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  appError,
  AuthUserDto,
  DEFAULT_STUDIO_ID,
  DisplayDeviceDto,
  DisplayDeviceStatus,
  LoginResponseDto,
  MonitorTestPingPayload,
  PairDisplayResponseDto,
  Role,
} from '@reform/shared';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MonitorGateway } from '../monitor/monitor.gateway';
import {
  CreateStaffUserDto,
  InitDisplayPairingDto,
  LoginDto,
  SendMonitorTestSignalDto,
  UnpairSelfDeviceDto,
  UpdateDisplayDeviceDto,
  VerifyDisplayPairingDto,
} from './auth.dto';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 perc

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Optional()
    @Inject(forwardRef(() => MonitorGateway))
    private monitorGateway?: MonitorGateway,
  ) {}

  private toDisplayDeviceDto(device: {
    id: string;
    name: string;
    pairingCode: string | null;
    pairingExpiresAt?: Date | null;
    pairedAt?: Date | null;
    isActive: boolean;
    lastSeenAt?: Date | null;
    lastActivityType?: string | null;
    createdAt: Date;
  }): DisplayDeviceDto {
    const now = Date.now();
    let status: DisplayDeviceStatus = 'PAIRED';

    if (device.pairingCode) {
      const expiresAtMs = device.pairingExpiresAt
        ? device.pairingExpiresAt.getTime()
        : now + PAIRING_CODE_TTL_MS;
      status = expiresAtMs <= now ? 'EXPIRED' : 'PENDING_PAIRING';
    }

    const isOnline = this.monitorGateway
      ? this.monitorGateway.isDeviceOnline(device.id)
      : false;

    return {
      id: device.id,
      name: device.name,
      status,
      pairingCode: device.pairingCode,
      pairingExpiresAt: device.pairingExpiresAt
        ? device.pairingExpiresAt.toISOString()
        : null,
      pairedAt: device.pairedAt ? device.pairedAt.toISOString() : null,
      isActive: device.isActive,
      lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
      lastActivityType: device.lastActivityType ?? null,
      isOnline,
      createdAt: device.createdAt.toISOString(),
    };
  }

  private async ensureUniqueDeviceName(
    name: string,
    studioId: string,
    excludeDeviceId?: string,
  ): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw appError('AUTH.DEVICE_NAME_REQUIRED');
    }

    const devices = await this.prisma.displayDevice.findMany({
      where: { studioId },
    });

    const duplicate = devices.find(
      (d) =>
        d.id !== excludeDeviceId &&
        d.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );

    if (duplicate) {
      throw appError('AUTH.DEVICE_NAME_TAKEN', {
        message: `Már létezik "${trimmed}" nevű kijelző! Válassz másik nevet, vagy kezeld a meglévő eszközt a listában.`,
      });
    }
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (!user || !user.isActive) {
      throw appError('AUTH.INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw appError('AUTH.INVALID_CREDENTIALS');
    }

    const authUser: AuthUserDto = {
      id: user.id,
      studioId: user.studioId,
      email: user.email,
      name: user.name,
      role: user.role as unknown as Role,
    };

    const accessToken = await this.jwtService.signAsync({
      sub: authUser.id,
      email: authUser.email,
      studioId: authUser.studioId,
      role: authUser.role,
      name: authUser.name,
    });

    return {
      accessToken,
      user: authUser,
    };
  }

  async listStaffUsers(studioId = DEFAULT_STUDIO_ID) {
    const users = await this.prisma.user.findMany({
      where: { studioId },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      studioId: u.studioId,
      email: u.email,
      name: u.name,
      role: u.role as unknown as Role,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async createStaffUser(
    dto: CreateStaffUserDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<AuthUserDto> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw appError('AUTH.STAFF_EMAIL_TAKEN');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: {
        studioId,
        email,
        name: dto.name.trim(),
        passwordHash,
        role: dto.role ?? Role.RECEPTIONIST,
      },
    });

    return {
      id: created.id,
      studioId: created.studioId,
      email: created.email,
      name: created.name,
      role: created.role as unknown as Role,
    };
  }

  async initDisplayPairing(
    dto: InitDisplayPairingDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<DisplayDeviceDto> {
    await this.ensureUniqueDeviceName(dto.name, studioId);

    const pairingCode = String(randomInt(100000, 999999));
    const pairingExpiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
    const deviceToken = randomBytes(32).toString('hex');

    const device = await this.prisma.displayDevice.create({
      data: {
        studioId,
        name: dto.name.trim(),
        pairingCode,
        pairingExpiresAt,
        pairedAt: null,
        deviceToken,
        isActive: true,
        lastSeenAt: null,
        lastActivityType: null,
      },
    });

    return this.toDisplayDeviceDto(device);
  }

  async verifyDisplayPairing(
    dto: VerifyDisplayPairingDto,
  ): Promise<PairDisplayResponseDto> {
    const code = dto.pairingCode.trim();
    const device = await this.prisma.displayDevice.findUnique({
      where: { pairingCode: code },
    });

    if (!device || !device.isActive) {
      throw appError('AUTH.DEVICE_PAIRING_CODE_INVALID');
    }

    if (
      device.pairingExpiresAt &&
      device.pairingExpiresAt.getTime() <= Date.now()
    ) {
      throw appError('AUTH.DEVICE_PAIRING_CODE_EXPIRED');
    }

    const now = new Date();
    const updated = await this.prisma.displayDevice.update({
      where: { id: device.id },
      data: {
        pairingCode: null,
        pairingExpiresAt: null,
        pairedAt: now,
        lastSeenAt: now,
        lastActivityType: 'Sikeresen párosítva',
      },
    });

    return {
      deviceToken: updated.deviceToken,
      device: this.toDisplayDeviceDto(updated),
    };
  }

  async listDisplayDevices(
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<DisplayDeviceDto[]> {
    const devices = await this.prisma.displayDevice.findMany({
      where: { studioId },
      orderBy: { createdAt: 'desc' },
    });

    return devices.map((d) => this.toDisplayDeviceDto(d));
  }

  async regenerateDisplayPairingCode(
    deviceId: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<DisplayDeviceDto> {
    const existing = await this.prisma.displayDevice.findFirst({
      where: { id: deviceId, studioId },
    });

    if (!existing) {
      throw appError('AUTH.DEVICE_NOT_FOUND');
    }

    const pairingCode = String(randomInt(100000, 999999));
    const pairingExpiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
    const newDeviceToken = randomBytes(32).toString('hex');

    const updated = await this.prisma.displayDevice.update({
      where: { id: existing.id },
      data: {
        pairingCode,
        pairingExpiresAt,
        pairedAt: null,
        deviceToken: newDeviceToken,
        isActive: true,
        lastSeenAt: null,
        lastActivityType: null,
      },
    });

    this.monitorGateway?.disconnectDevice({
      deviceId: existing.id,
      reason: 'A recepció új párosító kódot kért ehhez a kijelzőhöz.',
      timestamp: new Date().toISOString(),
    });

    return this.toDisplayDeviceDto(updated);
  }

  async renameDisplayDevice(
    deviceId: string,
    dto: UpdateDisplayDeviceDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<DisplayDeviceDto> {
    const existing = await this.prisma.displayDevice.findFirst({
      where: { id: deviceId, studioId },
    });

    if (!existing) {
      throw appError('AUTH.DEVICE_NOT_FOUND');
    }

    await this.ensureUniqueDeviceName(dto.name, studioId, deviceId);

    const updated = await this.prisma.displayDevice.update({
      where: { id: existing.id },
      data: {
        name: dto.name.trim(),
      },
    });

    return this.toDisplayDeviceDto(updated);
  }

  async deleteDisplayDevice(
    deviceId: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<{ deletedId: string }> {
    const existing = await this.prisma.displayDevice.findFirst({
      where: { id: deviceId, studioId },
    });

    if (!existing) {
      throw appError('AUTH.DEVICE_NOT_FOUND');
    }

    await this.prisma.displayDevice.delete({
      where: { id: existing.id },
    });

    this.monitorGateway?.disconnectDevice({
      deviceId: existing.id,
      reason: 'A kijelző párosítása törlésre került a recepcióról.',
      timestamp: new Date().toISOString(),
    });

    return { deletedId: existing.id };
  }

  async unpairSelfDevice(
    dto: UnpairSelfDeviceDto,
  ): Promise<{ unpairedId: string }> {
    const device = await this.prisma.displayDevice.findUnique({
      where: { deviceToken: dto.deviceToken.trim() },
    });

    if (!device) {
      return { unpairedId: 'unknown' };
    }

    await this.prisma.displayDevice.delete({
      where: { id: device.id },
    });

    this.monitorGateway?.disconnectDevice({
      deviceId: device.id,
      reason: 'A kijelző párosítását megszakították az eszközről.',
      timestamp: new Date().toISOString(),
    });

    return { unpairedId: device.id };
  }

  async sendMonitorTestSignal(
    dto: SendMonitorTestSignalDto,
    senderName: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<MonitorTestPingPayload> {
    let targetDeviceName: string | null = null;
    const now = new Date();

    if (dto.deviceId) {
      const device = await this.prisma.displayDevice.findFirst({
        where: { id: dto.deviceId, studioId },
      });
      if (!device) {
        throw appError('AUTH.DEVICE_NOT_FOUND', {
          message: 'A megadott kijelző nem található.',
        });
      }
      targetDeviceName = device.name;
      if (!device.pairingCode) {
        await this.prisma.displayDevice.update({
          where: { id: device.id },
          data: {
            lastSeenAt: now,
            lastActivityType: 'Teszt jel fogadva',
          },
        });
      }
    } else {
      await this.prisma.displayDevice.updateMany({
        where: { studioId, pairingCode: null, isActive: true },
        data: {
          lastSeenAt: now,
          lastActivityType: 'Teszt jel fogadva',
        },
      });
    }

    const payload: MonitorTestPingPayload = {
      deviceId: dto.deviceId ?? null,
      deviceName: targetDeviceName,
      senderName,
      message: targetDeviceName
        ? `Teszt jel sikeresen fogadva a(z) "${targetDeviceName}" kijelzőn!`
        : 'Teszt jel sikeresen fogadva! A Vendégmonitor kapcsolat aktív.',
      timestamp: now.toISOString(),
    };

    this.monitorGateway?.emitTestPing(payload, studioId);
    return payload;
  }

  async recordDeviceActivity(
    deviceId: string,
    activityType: string,
  ): Promise<void> {
    await this.prisma.displayDevice.update({
      where: { id: deviceId },
      data: {
        lastSeenAt: new Date(),
        lastActivityType: activityType,
      },
    });
  }

  async validateSocketToken(token: string): Promise<{
    studioId: string;
    type: 'STAFF' | 'DEVICE';
    name: string;
    deviceId?: string;
  }> {
    try {
      const payload = await this.jwtService.verifyAsync(token);
      return {
        studioId: payload.studioId ?? DEFAULT_STUDIO_ID,
        type: 'STAFF',
        name: payload.name ?? 'Recepciós Kijelző',
      };
    } catch {
      const device = await this.prisma.displayDevice.findUnique({
        where: { deviceToken: token },
      });

      if (!device || !device.isActive || device.pairingCode !== null) {
        throw appError('AUTH.DEVICE_TOKEN_INVALID');
      }

      // A lekérdezés óta törölt vagy új tokent kapott eszköznél 0 sor frissül
      // (az `update` itt P2025-öt dobna, és a kliens COMMON.INTERNAL-t kapna).
      const { count } = await this.prisma.displayDevice.updateMany({
        where: { id: device.id, deviceToken: token },
        data: {
          lastSeenAt: new Date(),
          lastActivityType: 'Kapcsolódva a szinkron-csatornára',
        },
      });
      if (count === 0) {
        throw appError('AUTH.DEVICE_TOKEN_INVALID');
      }

      return {
        studioId: device.studioId,
        type: 'DEVICE',
        name: device.name,
        deviceId: device.id,
      };
    }
  }
}
