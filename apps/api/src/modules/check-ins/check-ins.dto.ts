import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CHECK_IN_OVERRIDE_REASON_MAX_LENGTH, VisitType } from '@reform/shared';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Kivételes beengedés (TICKET-15): a tartozás miatti tiltás feloldása, recepciósnak és adminnak.
 * Az indoklás `forceOverride` mellett kötelező (üresen 400 `CHECKIN.OVERRIDE_REASON_REQUIRED`).
 */
export class CheckInOverrideDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Kivételes beengedés: a tartozás (türelmi időn túli tagdíj, bérlet-hátralék, ismeretlen hátralék) miatti tiltást feloldja, naplózva (audit: CHECKIN_OVERRIDE). Más okú elutasítást nem old fel.',
  })
  @IsOptional()
  @IsBoolean()
  forceOverride?: boolean;

  @ApiPropertyOptional({
    example: 'A vendég ma átutalta a tagdíjat, a bizonylatot bemutatta.',
    description: 'A kivételes beengedés indoklása (naplózva). `forceOverride` mellett kötelező.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(CHECK_IN_OVERRIDE_REASON_MAX_LENGTH)
  overrideReason?: string;
}

export class ScanCheckInDto extends CheckInOverrideDto {
  @ApiProperty({ example: '100001' })
  @IsString()
  @IsNotEmpty({ message: 'A vonalkód megadása kötelező.' })
  barcode: string;

  @ApiPropertyOptional({
    enum: VisitType,
    default: VisitType.CIRCUIT_TRAINING,
    description:
      'Kompatibilitási mező, a döntést nem befolyásolja: tagság vagy köredzésre érvényes időalapú bérlet → köredzés (0 levonás); csak kezelésre szóló bérlet → TREATMENT_SELECTION_REQUIRED (nincs belépés, a kezelésválasztóból történik a levonás).',
  })
  @IsOptional()
  @IsEnum(VisitType)
  visitType?: VisitType;

  @ApiPropertyOptional({
    default: false,
    description:
      'Ha true, a 10 másodperces dupla lehúzás védelmet felülbírálva rögzíti az eseményt.',
  })
  @IsOptional()
  @IsBoolean()
  forceDuplicate?: boolean;

  @ApiPropertyOptional({
    description: 'Idempotencia kulcs (pl. offline várólista szinkronizálásakor).',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class OfflineScanItemInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  barcode: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  scannedAt: string;
}

export class SyncOfflineScansDto {
  @ApiProperty({ type: [OfflineScanItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfflineScanItemInputDto)
  items: OfflineScanItemInputDto[];
}

export class RevokeCheckInDto {
  @ApiPropertyOptional({
    example: 'Téves vendég lett beléptetve',
    description: 'A sztornó oka (naplózva). Ha üres: „Téves beléptetés”.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
