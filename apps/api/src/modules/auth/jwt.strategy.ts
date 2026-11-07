import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { appError, AuthUserDto, Role } from '@reform/shared';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  studioId: string;
  role: Role;
  name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ??
        'reform-studio-dev-secret-change-in-prod',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw appError('AUTH.ACCOUNT_INACTIVE');
    }

    return {
      id: user.id,
      studioId: user.studioId,
      email: user.email,
      name: user.name,
      role: user.role as unknown as Role,
    };
  }
}
