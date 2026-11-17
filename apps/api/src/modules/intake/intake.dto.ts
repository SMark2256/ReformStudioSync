import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Gender,
  IntakeAnswers,
  IntakeMeasurementDraft,
  IntakeProfileDraft,
  IntakeSource,
  IntakeStatus,
} from '@reform/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class IntakeProfileDto implements IntakeProfileDraft {
  @ApiPropertyOptional({ example: 'Kovács' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ example: 'Anna' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: '1990-05-12' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'A születési dátum ÉÉÉÉ-HH-NN alakú.' })
  birthDate?: string | null;

  @ApiPropertyOptional({ example: '+36 30 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'anna@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string | null;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}

export class CreateIntakeSessionDto {
  @ApiPropertyOptional({ description: 'Meglévő vendég azonosítója' })
  @IsOptional()
  @IsString()
  guestId?: string;

  @ApiPropertyOptional({ type: IntakeProfileDto, description: 'Új vendég (a tableten is kitölthető)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => IntakeProfileDto)
  newGuest?: IntakeProfileDto;

  @ApiProperty({ example: ['CIRCUIT'] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Válassz legalább egy csomagot.' })
  @ArrayMaxSize(10)
  @IsString({ each: true })
  packageKeys: string[];

  @ApiProperty({ enum: ['PC', 'TABLET'] })
  @IsIn(['PC', 'TABLET'])
  source: IntakeSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acknowledgeDuplicates?: boolean;
}

export class UpdateIntakeSessionDto {
  @ApiPropertyOptional({ type: IntakeProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IntakeProfileDto)
  profile?: IntakeProfileDto;

  @ApiPropertyOptional({ description: 'Mérések (testsúly, Omron, körfogatok)' })
  @IsOptional()
  @IsObject()
  measurements?: IntakeMeasurementDraft;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  linkGuestId?: string | null;
}

export class DuplicateCheckDto extends IntakeProfileDto {}

export class SendIntakeToDeviceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}

export class ListIntakeSessionsQueryDto {
  @ApiPropertyOptional({ enum: IntakeStatus })
  @IsOptional()
  @IsEnum(IntakeStatus)
  status?: IntakeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guestId?: string;
}

export class SaveIntakeAnswersDto {
  @ApiProperty({ example: 'health-questionnaire' })
  @IsString()
  @IsNotEmpty()
  formKey: string;

  @ApiProperty({ example: { surgeryLast6Weeks: 'NO' } })
  @IsObject()
  answers: IntakeAnswers;
}

export class SaveIntakePhotoDto {
  @ApiProperty({ description: 'data:image/webp;base64,…' })
  @IsString()
  @Matches(/^data:image\/(webp|jpeg|png);base64,/, { message: 'Érvénytelen képformátum.' })
  dataUrl: string;
}

export class SubmitIntakeDto {
  @ApiProperty({ description: 'data:image/png;base64,…' })
  @IsString()
  @Matches(/^data:image\/png;base64,/, { message: 'Érvénytelen aláírás.' })
  signatureDataUrl: string;
}

export class ExitIntakeGuestModeDto {
  @ApiProperty({ example: '482913' })
  @Matches(/^\d{6}$/, { message: 'A kilépési kód 6 számjegy.' })
  exitCode: string;
}
