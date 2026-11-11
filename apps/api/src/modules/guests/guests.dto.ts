import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType, Gender, GuestStatus, Role } from '@reform/shared';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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

  @ApiPropertyOptional({ example: '1992-07-26' })
  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @ApiPropertyOptional({ example: '07-26', description: 'Névnap MM-DD formátumban' })
  @IsOptional()
  @IsString()
  nameDay?: string | null;

  @ApiProperty({
    enum: Gender,
    description:
      'Új vendégnél kötelező; a felület a keresztnévből előtölti (inferGenderFromFirstName).',
  })
  @IsEnum(Gender, { message: 'A vendég nemének megadása kötelező.' })
  gender: Gender;

  @ApiPropertyOptional({ enum: GuestStatus, default: GuestStatus.ACTIVE })
  @IsOptional()
  @IsEnum(GuestStatus)
  status?: GuestStatus;

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
  birthDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameDay?: string | null;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: GuestStatus })
  @IsOptional()
  @IsEnum(GuestStatus)
  status?: GuestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateMeasurementDto {
  @IsOptional()
  @IsString()
  measuredAt?: string;

  @IsOptional()
  @IsNumber()
  weightKg?: number | null;

  @IsOptional()
  @IsNumber()
  bodyFatPct?: number | null;

  @IsOptional()
  @IsNumber()
  muscleMassKg?: number | null;

  @IsOptional()
  @IsNumber()
  visceralFat?: number | null;

  @IsOptional()
  @IsNumber()
  waistCm?: number | null;

  @IsOptional()
  @IsNumber()
  hipCm?: number | null;

  @IsOptional()
  @IsNumber()
  thighCm?: number | null;

  @IsOptional()
  @IsNumber()
  armCm?: number | null;

  @IsOptional()
  @IsNumber()
  chestCm?: number | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class CreateGuestPhotoDto {
  @IsOptional()
  @IsString()
  serviceId?: string | null;

  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  originalSizeBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  compressedSizeBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsEnum(Role)
  visibilityRole?: Role;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class CreateGuestDocumentDto {
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  contentText: string;

  @IsOptional()
  fieldsJson?: Record<string, string>;

  @IsOptional()
  @IsString()
  signatureDataUrl?: string | null;
}

export class SignGuestDocumentDto {
  @IsString()
  @IsNotEmpty({ message: 'Az aláírás képének megadása kötelező.' })
  signatureDataUrl: string;

  @IsOptional()
  fieldsJson?: Record<string, string>;
}

export class CreateGuestNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'A megjegyzés szövege nem lehet üres.' })
  content: string;
}

export class SendGuestMessageDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  messageType: string;
}
