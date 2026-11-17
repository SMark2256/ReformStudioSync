import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AudiencePassState,
  EMAIL_BODY_MAX_LENGTH,
  EMAIL_BULK_MAX_RECIPIENTS,
  EMAIL_SUBJECT_MAX_LENGTH,
  EMAIL_TEMPLATE_NAME_MAX_LENGTH,
  MessageStatus,
} from '@reform/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const PASS_STATES: AudiencePassState[] = ['ANY', 'CURRENT', 'LAPSED', 'NEVER'];

export class EmailContentDto {
  @ApiProperty({ example: 'Boldog születésnapot, {{keresztnev}}!' })
  @IsString()
  @IsNotEmpty({ message: 'A levél tárgya kötelező.' })
  @MaxLength(EMAIL_SUBJECT_MAX_LENGTH)
  subject: string;

  @ApiProperty({ example: '<p>Kedves {{keresztnev}}!</p>', description: 'HTML; a szerver szanitizálja.' })
  @IsString()
  @IsNotEmpty({ message: 'A levél szövege kötelező.' })
  @MaxLength(EMAIL_BODY_MAX_LENGTH)
  bodyHtml: string;
}

export class SaveEmailTemplateBodyDto extends EmailContentDto {
  @ApiProperty({ example: 'Születésnapi köszöntő' })
  @IsString()
  @IsNotEmpty({ message: 'A sablon neve kötelező.' })
  @MaxLength(EMAIL_TEMPLATE_NAME_MAX_LENGTH)
  name: string;
}

export class SendGuestEmailBodyDto extends EmailContentDto {
  @ApiPropertyOptional({ description: 'A felhasznált sablon (a naplóhoz).' })
  @IsOptional()
  @IsString()
  templateId?: string | null;
}

export class UpdateEmailAutomationBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  templateId?: string | null;
}

export class LastVisitFilterDto {
  @IsIn(['WITHIN', 'NOT_WITHIN'])
  mode: 'WITHIN' | 'NOT_WITHIN';

  @IsInt()
  @Min(1)
  @Max(3650)
  days: number;
}

export class EmailAudienceFilterBodyDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[];

  @ApiPropertyOptional({ enum: PASS_STATES })
  @IsOptional()
  @IsIn(PASS_STATES)
  passState?: AudiencePassState;

  @ApiPropertyOptional({ type: LastVisitFilterDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => LastVisitFilterDto)
  lastVisit?: LastVisitFilterDto | null;
}

export class AudiencePreviewBodyDto {
  @ValidateNested()
  @Type(() => EmailAudienceFilterBodyDto)
  filter: EmailAudienceFilterBodyDto;
}

export class SendBulkEmailBodyDto extends SendGuestEmailBodyDto {
  @ValidateNested()
  @Type(() => EmailAudienceFilterBodyDto)
  filter: EmailAudienceFilterBodyDto;

  @ApiProperty({ type: [String], description: 'Az előnézetben jóváhagyott címzettek.' })
  @IsArray()
  @ArrayMaxSize(EMAIL_BULK_MAX_RECIPIENTS)
  @IsString({ each: true })
  guestIds: string[];
}

export class ListEmailMessagesQueryDto {
  @IsOptional()
  @IsEnum(MessageStatus)
  status?: MessageStatus;

  @IsOptional()
  @IsString()
  messageType?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
