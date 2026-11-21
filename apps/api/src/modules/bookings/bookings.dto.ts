import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@reform/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// ---------------------------------------------------------------------------
// Recepció
// ---------------------------------------------------------------------------

export class CreateStaffBookingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  guestId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Válassz legalább egy kezelést.' })
  @ArrayMaxSize(6)
  @IsString({ each: true })
  treatmentIds: string[];

  @ApiPropertyOptional({ example: '2026-11-20T08:00:00.000Z', description: 'Helyben beengedésnél nem kell.' })
  @ValidateIf((o: CreateStaffBookingDto) => !o.walkIn)
  @IsISO8601({}, { message: 'Érvényes kezdési időpontot adj meg.' })
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  overrideRules?: boolean;

  @ApiPropertyOptional({ description: 'Helyben beengedés: a kezdés most (5 percre lefelé kerekítve).' })
  @IsOptional()
  @IsBoolean()
  walkIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RescheduleBookingDto {
  @ApiProperty()
  @IsISO8601({}, { message: 'Érvényes kezdési időpontot adj meg.' })
  startsAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  overrideRules?: boolean;
}

export class CancelBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  overrideRules?: boolean;
}

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: BookingStatus })
  @IsIn([BookingStatus.CONFIRMED, BookingStatus.LATE, BookingStatus.ARRIVED, BookingStatus.NO_SHOW], {
    message: 'Érvénytelen állapot.',
  })
  status: BookingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CreateClosureDto {
  @ApiProperty()
  @IsISO8601()
  startsAt: string;

  @ApiProperty()
  @IsISO8601()
  endsAt: string;

  @ApiPropertyOptional({ description: 'Üres: teljes zárvatartás; egyébként a letiltott gép.' })
  @IsOptional()
  @IsString()
  resourceId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class UpsertHolidayOverrideDto {
  @ApiProperty({ example: '2026-12-24' })
  @Matches(DAY_KEY, { message: 'A nap formátuma ÉÉÉÉ-HH-NN.' })
  dayKey: string;

  @ApiProperty()
  @IsBoolean()
  isOpen: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class UpdateBookingSettingsDto {
  @ApiPropertyOptional({ description: '7 elem (hétfő…vasárnap): { opensAt, closesAt, lastStartAt } percben, vagy null.' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  openingHours?: unknown[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  maxAdvanceDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  minLeadMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  changeCutoffHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  holdMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([5, 10, 15, 20, 30])
  slotStepMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  locationText?: string;
}

export class ReorderTreatmentsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  treatmentIds: string[];
}

export class UpdateTreatmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;
}

export class UpdateResourceDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class CreateStaffWaitlistDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  guestId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  treatmentId: string;

  @ApiProperty()
  @Matches(DAY_KEY, { message: 'A nap formátuma ÉÉÉÉ-HH-NN.' })
  dayKey: string;

  @ApiProperty({ example: '09:00' })
  @Matches(TIME, { message: 'Az idő formátuma ÓÓ:PP.' })
  fromTime: string;

  @ApiProperty({ example: '12:00' })
  @Matches(TIME, { message: 'Az idő formátuma ÓÓ:PP.' })
  toTime: string;
}

// ---------------------------------------------------------------------------
// Nyilvános foglaló
// ---------------------------------------------------------------------------

export class PublicContactBody {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'A vezetéknév megadása kötelező.' })
  @MaxLength(80)
  lastName: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'A keresztnév megadása kötelező.' })
  @MaxLength(80)
  firstName: string;

  @ApiProperty()
  @Transform(trim)
  @IsEmail({}, { message: 'Érvényes e-mail címet adj meg.' })
  @MaxLength(200)
  email: string;

  @ApiProperty({ example: '+36 30 123 4567' })
  @Transform(trim)
  @Matches(/^\+?[0-9 ()/-]{7,20}$/, { message: 'Érvényes telefonszámot adj meg.' })
  phone: string;
}

export class PublicCreateBookingBody {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Válassz legalább egy kezelést.' })
  @ArrayMaxSize(6)
  @IsString({ each: true })
  treatmentIds: string[];

  @ApiProperty()
  @IsISO8601({}, { message: 'Érvényes időpontot válassz.' })
  startsAt: string;

  @ApiPropertyOptional({ type: PublicContactBody })
  @IsOptional()
  @ValidateNested()
  @Type(() => PublicContactBody)
  contact?: PublicContactBody;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty()
  @IsBoolean()
  privacyAccepted: boolean;
}

export class GuestCodeRequestBody {
  @ApiProperty()
  @Transform(trim)
  @IsEmail({}, { message: 'Érvényes e-mail címet adj meg.' })
  email: string;
}

export class GuestCodeVerifyBody {
  @ApiProperty()
  @Transform(trim)
  @IsEmail({}, { message: 'Érvényes e-mail címet adj meg.' })
  email: string;

  @ApiProperty({ example: '123456' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s/g, '') : value))
  @Matches(/^\d{6}$/, { message: 'A belépőkód 6 számjegyből áll.' })
  code: string;
}

export class PublicRescheduleBody {
  @ApiProperty()
  @IsISO8601({}, { message: 'Érvényes időpontot válassz.' })
  startsAt: string;
}

export class PublicWaitlistBody {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  treatmentId: string;

  @ApiProperty()
  @Matches(DAY_KEY, { message: 'A nap formátuma ÉÉÉÉ-HH-NN.' })
  dayKey: string;

  @ApiProperty({ example: '09:00' })
  @Matches(TIME, { message: 'Az idő formátuma ÓÓ:PP.' })
  fromTime: string;

  @ApiProperty({ example: '12:00' })
  @Matches(TIME, { message: 'Az idő formátuma ÓÓ:PP.' })
  toTime: string;

  @ApiPropertyOptional({ type: PublicContactBody })
  @IsOptional()
  @ValidateNested()
  @Type(() => PublicContactBody)
  contact?: PublicContactBody;

  @ApiProperty()
  @IsBoolean()
  privacyAccepted: boolean;
}
