import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@reform/shared';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class RequestLoginCodeDto {
  @ApiProperty({ example: 'smark.siklodi@gmail.com' })
  @IsEmail({}, { message: 'Érvényes e-mail cím megadása kötelező.' })
  email: string;
}

export class VerifyLoginCodeDto {
  @ApiProperty({ example: 'smark.siklodi@gmail.com' })
  @IsEmail({}, { message: 'Érvényes e-mail cím megadása kötelező.' })
  email: string;

  @ApiProperty({ example: '847291' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s/g, '') : value))
  @Matches(/^\d{6}$/, { message: 'A belépőkód 6 számjegyből áll.' })
  code: string;
}

export class CreateStaffUserDto {
  @ApiProperty({ example: 'ujrecepcio@reformstudio.hu' })
  @IsEmail({}, { message: 'Érvényes e-mail cím megadása kötelező.' })
  email: string;

  @ApiProperty({ example: 'Kovács Réka' })
  @IsString()
  @IsNotEmpty({ message: 'A név megadása kötelező.' })
  name: string;

  @ApiPropertyOptional({ enum: Role, default: Role.RECEPTIONIST })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class InitDisplayPairingDto {
  @ApiProperty({ example: 'Recepciós Pult Tablet #1' })
  @IsString()
  @IsNotEmpty({ message: 'Az eszköz nevének megadása kötelező.' })
  name: string;
}

export class VerifyDisplayPairingDto {
  @ApiProperty({ example: '482910' })
  @IsString()
  @IsNotEmpty({ message: 'A 6 jegyű párosító kód megadása kötelező.' })
  pairingCode: string;
}

export class UpdateDisplayDeviceDto {
  @ApiProperty({ example: 'Pult iPad #1' })
  @IsString()
  @IsNotEmpty({ message: 'Az eszköz nevének megadása kötelező.' })
  name: string;
}

export class UnpairSelfDeviceDto {
  @ApiProperty({ example: 'device-token-hash' })
  @IsString()
  @IsNotEmpty({ message: 'Az eszköz token megadása kötelező.' })
  deviceToken: string;
}

export class SendMonitorTestSignalDto {
  @ApiPropertyOptional({ example: 'device-uuid' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
