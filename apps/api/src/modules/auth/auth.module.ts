import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { MonitorModule } from '../monitor/monitor.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { LoginCodeService } from './login-code.service';

@Module({
  imports: [
    PassportModule,
    MailModule,
    forwardRef(() => MonitorModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_SECRET') ??
          'reform-studio-dev-secret-change-in-prod',
        signOptions: { expiresIn: '14h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LoginCodeService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
