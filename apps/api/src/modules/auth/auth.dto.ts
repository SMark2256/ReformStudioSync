import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@reform/shared';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'recepcio@reformstudio.hu' })
  @IsEmail({}, { message: 'Érvényes e-mail cím megadása kötelező.' })
  email: string;

  @ApiProperty({ example: 'Recepcio123!' })
  @IsString()
  @IsNotEmpty({ message: 'A jelszó megadása kötelező.' })
  password: string;
}

export class CreateStaffUserDto {
  @ApiProperty({ example: 'ujrecepcio@reformstudio.hu' })
  @IsEmail({}, { message: 'Érvényes e-mail cím megadása kötelező.' })
  email: string;

  @ApiProperty({ example: 'Kovács Réka' })
  @IsString()
  @IsNotEmpty({ message: 'A név megadása kötelező.' })
  name: string;

  @ApiProperty({ example: 'Jelszo123!' })
  @IsString()
  @MinLength(6, { message: 'A jelszónak legalább 6 karakternek kell lennie.' })
  password: string;

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
