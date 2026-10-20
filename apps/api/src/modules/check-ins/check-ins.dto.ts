import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScanCheckInDto {
  @ApiProperty({ example: '100001' })
  @IsString()
  @IsNotEmpty({ message: 'A vonalkód megadása kötelező.' })
  barcode: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Ha true, a 60 másodperces dupla lehúzás védelmet felülbírálva levon még egy alkalmat.',
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
