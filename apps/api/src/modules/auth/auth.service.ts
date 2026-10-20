import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AuthUserDto,
  DEFAULT_STUDIO_ID,
  DisplayDeviceDto,
  LoginResponseDto,
  PairDisplayResponseDto,
  Role,
} from '@reform/shared';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateStaffUserDto,
  InitDisplayPairingDto,
  LoginDto,
  VerifyDisplayPairingDto,
} from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Hibás e-mail cím vagy jelszó.');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Hibás e-mail cím vagy jelszó.');
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
      throw new ConflictException(
        'Ezzel az e-mail címmel már létezik munkatárs.',
      );
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
    const pairingCode = String(randomInt(100000, 999999));
    const deviceToken = randomBytes(32).toString('hex');

    const device = await this.prisma.displayDevice.create({
      data: {
        studioId,
        name: dto.name.trim(),
        pairingCode,
        deviceToken,
        isActive: true,
      },
    });

    return {
      id: device.id,
      name: device.name,
      pairingCode: device.pairingCode,
      isActive: device.isActive,
      lastSeenAt: device.lastSeenAt.toISOString(),
      createdAt: device.createdAt.toISOString(),
    };
  }

  async verifyDisplayPairing(
    dto: VerifyDisplayPairingDto,
  ): Promise<PairDisplayResponseDto> {
    const code = dto.pairingCode.trim();
    const device = await this.prisma.displayDevice.findUnique({
      where: { pairingCode: code },
    });

    if (!device || !device.isActive) {
      throw new BadRequestException(
        'Érvénytelen vagy már felhasznált párosító kód.',
      );
    }

    const updated = await this.prisma.displayDevice.update({
      where: { id: device.id },
      data: {
        pairingCode: null,
        lastSeenAt: new Date(),
      },
    });

    return {
      deviceToken: updated.deviceToken,
      device: {
        id: updated.id,
        name: updated.name,
        pairingCode: null,
        isActive: updated.isActive,
        lastSeenAt: updated.lastSeenAt.toISOString(),
        createdAt: updated.createdAt.toISOString(),
      },
    };
  }

  async listDisplayDevices(
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<DisplayDeviceDto[]> {
    const devices = await this.prisma.displayDevice.findMany({
      where: { studioId },
      orderBy: { createdAt: 'desc' },
    });

    return devices.map((d) => ({
      id: d.id,
      name: d.name,
      pairingCode: d.pairingCode,
      isActive: d.isActive,
      lastSeenAt: d.lastSeenAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
    }));
  }

  async validateSocketToken(
    token: string,
  ): Promise<{ studioId: string; type: 'STAFF' | 'DEVICE'; name: string }> {
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

      if (!device || !device.isActive) {
        throw new UnauthorizedException('Érvénytelen kijelző token.');
      }

      await this.prisma.displayDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      });

      return {
        studioId: device.studioId,
        type: 'DEVICE',
        name: device.name,
      };
    }
  }
}
