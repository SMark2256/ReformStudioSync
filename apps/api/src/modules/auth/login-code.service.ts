import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  appError,
  AuthUserDto,
  LOGIN_CODE_TTL_MINUTES,
  LoginResponseDto,
  RequestLoginCodeResponseDto,
  Role,
} from '@reform/shared';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { renderLoginCodeEmail } from '../mail/templates/login-code';
import { RequestLoginCodeDto, VerifyLoginCodeDto } from './auth.dto';

const MINUTE_MS = 60 * 1000;
const CODE_TTL_MS = LOGIN_CODE_TTL_MINUTES * MINUTE_MS;
/** Ugyanarra a címre legfeljebb percenként egy, óránként öt kód. */
const RESEND_INTERVAL_MS = MINUTE_MS;
const MAX_CODES_PER_HOUR = 5;
const HOUR_MS = 60 * MINUTE_MS;
/** Kódonként ennyi próbálkozás; az utolsó hibás után a kód elvész. */
const MAX_CODE_ATTEMPTS = 5;

/**
 * Belépés e-mailben küldött, egyszer használatos 6 jegyű kóddal (TICKET-35).
 *
 * Az adatbázisban csak a kód HMAC-SHA256 hash-e van. A sorok címhez kötöttek: ismeretlen
 * vagy inaktív címre is készül egy felhasználhatatlan sor (levél nélkül), így sem a válasz,
 * sem a kéréskorlát nem árulja el, ki munkatárs.
 */
@Injectable()
export class LoginCodeService {
  private readonly logger = new Logger(LoginCodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return (
      this.config.get<string>('JWT_SECRET') ??
      'reform-studio-dev-secret-change-in-prod'
    );
  }

  /** Teszteknek (E2E, CI): rögzített kód, levél és kéréskorlát nélkül. Productionben nincs. */
  private get fixedCode(): string | undefined {
    if (this.config.get<string>('NODE_ENV') === 'production') return undefined;
    return this.config.get<string>('AUTH_FIXED_LOGIN_CODE') || undefined;
  }

  private hash(code: string): string {
    return createHmac('sha256', this.secret).update(code).digest('hex');
  }

  async requestCode(dto: RequestLoginCodeDto): Promise<RequestLoginCodeResponseDto> {
    const email = normalizeEmail(dto.email);
    const now = new Date();
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const fixedCode = this.fixedCode;

    // Régi sorok takarítása: a korláthoz csak az utolsó óra kell, a kód 10 perc után lejár.
    await this.prisma.loginCode.deleteMany({ where: { createdAt: { lt: hourAgo } } });

    if (!fixedCode) {
      const recent = await this.prisma.loginCode.findMany({
        where: { email, createdAt: { gte: hourAgo } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const latest = recent[0]?.createdAt.getTime();
      if (
        recent.length >= MAX_CODES_PER_HOUR ||
        (latest !== undefined && now.getTime() - latest < RESEND_INTERVAL_MS)
      ) {
        throw appError('AUTH.CODE_RATE_LIMITED');
      }
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const eligible = Boolean(user?.isActive);
    const code = fixedCode ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    // Ismeretlen címnél a tárolt hash egyetlen kódhoz sem tartozik.
    const codeHash = eligible ? this.hash(code) : `unusable:${randomBytes(16).toString('hex')}`;

    // Az új kód a korábbiakat érvényteleníti.
    const [, created] = await this.prisma.$transaction([
      this.prisma.loginCode.updateMany({
        where: { email, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.prisma.loginCode.create({
        data: {
          email,
          codeHash,
          expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        },
      }),
    ]);

    if (!user || !eligible || fixedCode) return { ok: true };

    if (!this.mail.isConfigured) {
      this.logger.warn(
        `SENDPULSE_API_KEY nincs beállítva, levél nem ment ki. Belépőkód (${email}): ${code}`,
      );
      return { ok: true };
    }

    try {
      await this.mail.send(
        { email: user.email, name: user.name },
        renderLoginCodeEmail({
          code,
          name: user.name,
          ttlMinutes: LOGIN_CODE_TTL_MINUTES,
          requestedAt: now,
        }),
      );
    } catch (err) {
      // Ki nem ment kód ne fogyassza a kéréskorlátot: azonnal újra lehessen próbálni.
      await this.prisma.loginCode.delete({ where: { id: created.id } });
      throw err;
    }
    return { ok: true };
  }

  async verifyCode(dto: VerifyLoginCodeDto): Promise<LoginResponseDto> {
    const email = normalizeEmail(dto.email);
    const now = new Date();

    const loginCode = await this.prisma.loginCode.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!loginCode || loginCode.attempts >= MAX_CODE_ATTEMPTS) {
      throw appError('AUTH.CODE_INVALID');
    }

    if (!safeEqual(loginCode.codeHash, this.hash(dto.code))) {
      const attempts = loginCode.attempts + 1;
      const exhausted = attempts >= MAX_CODE_ATTEMPTS;
      // Feltételes frissítés: párhuzamos próbálkozások sem léphetik túl a korlátot.
      await this.prisma.loginCode.updateMany({
        where: { id: loginCode.id, attempts: loginCode.attempts, consumedAt: null },
        data: { attempts, ...(exhausted ? { consumedAt: now } : {}) },
      });
      throw appError(
        'AUTH.CODE_INVALID',
        exhausted
          ? { message: 'Túl sok hibás próbálkozás, ez a kód már nem használható. Kérj új kódot.' }
          : undefined,
      );
    }

    // Egyszer használható: csak az nyer, aki elsőként jelöli felhasználtnak.
    const { count } = await this.prisma.loginCode.updateMany({
      where: { id: loginCode.id, consumedAt: null },
      data: { consumedAt: now },
    });
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (count === 0 || !user || !user.isActive) {
      throw appError('AUTH.CODE_INVALID');
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
    return { accessToken, user: authUser };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
