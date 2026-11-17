import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { DisplayDevice, IntakeSession } from '@prisma/client';
import { appError, DEVICE_TOKEN_HEADER, INTAKE_TOKEN_HEADER } from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { hashGuestToken } from './intake-tokens';

type RequestWithIntake = {
  headers: Record<string, string | string[] | undefined>;
  intakeSession?: IntakeSession;
  device?: DisplayDevice;
};

const header = (request: RequestWithIntake, name: string): string => {
  const value = request.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
};

/**
 * Vendégmód (TICKET-56): a kérés csak egy kitöltéshez kötött, rövid életű munkamenet-tokennel
 * (`x-intake-token`) jut át. A végpontok minden adatot ebből a munkamenetből vesznek, azonosítót
 * nem fogadnak, így más vendég, vendéglista vagy recepciós adat nem érhető el.
 */
@Injectable()
export class IntakeGuestGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithIntake>();
    const token = header(request, INTAKE_TOKEN_HEADER);
    if (!token) throw appError('INTAKE.GUEST_TOKEN_INVALID');
    const session = await this.prisma.intakeSession.findUnique({
      where: { guestTokenHash: hashGuestToken(token) },
    });
    if (
      !session ||
      !session.guestTokenExpiresAt ||
      session.guestTokenExpiresAt.getTime() <= Date.now()
    ) {
      throw appError('INTAKE.GUEST_TOKEN_INVALID');
    }
    request.intakeSession = session;
    return true;
  }
}

/** Párosított vendégfelvételi tablet: az eszköztoken (`x-device-token`) alapján. */
@Injectable()
export class IntakeDeviceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithIntake>();
    const token = header(request, DEVICE_TOKEN_HEADER);
    if (!token) throw appError('AUTH.DEVICE_TOKEN_INVALID');
    const device = await this.prisma.displayDevice.findUnique({ where: { deviceToken: token } });
    if (!device || !device.isActive || device.pairingCode !== null) {
      throw appError('AUTH.DEVICE_TOKEN_INVALID');
    }
    if (device.kind !== 'TABLET') throw appError('INTAKE.DEVICE_NOT_TABLET');
    request.device = device;
    return true;
  }
}

export const CurrentIntakeSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IntakeSession =>
    ctx.switchToHttp().getRequest<RequestWithIntake>().intakeSession!,
);

export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DisplayDevice =>
    ctx.switchToHttp().getRequest<RequestWithIntake>().device!,
);
