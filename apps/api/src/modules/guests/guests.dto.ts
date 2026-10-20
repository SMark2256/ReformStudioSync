import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGuestDto {
  @ApiProperty({ example: 'Anna' })
  @IsString()
  @IsNotEmpty({ message: 'A keresztnév megadása kötelező.' })
  firstName: string;

  @ApiProperty({ example: 'Kovács' })
  @IsString()
  @IsNotEmpty({ message: 'A vezetéknév megadása kötelező.' })
  lastName: string;

  @ApiPropertyOptional({
    example: '100042',
    description: 'Ha üresen marad, a rendszer automatikusan generál egyet.',
  })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ example: 'anna.kovacs@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Érvénytelen e-mail cím formátum.' })
  email?: string;

  @ApiPropertyOptional({ example: '+36 30 555 1234' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Kezdő Reformer csoport' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateGuestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Érvénytelen e-mail cím formátum.' })
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
