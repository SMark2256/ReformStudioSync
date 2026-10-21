import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PassType, PaymentMethod, ServiceCategory } from '@reform/shared';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: 'Hypoxi Alakformálás' })
  @IsString()
  @IsNotEmpty({ message: 'A szolgáltatás nevének megadása kötelező.' })
  name: string;

  @ApiProperty({ enum: ServiceCategory, default: ServiceCategory.BODY_SHAPING })
  @IsEnum(ServiceCategory)
  category: ServiceCategory;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(5)
  durationMinutes: number;

  @ApiProperty({ example: 8500 })
  @IsInt()
  @Min(0)
  priceHuf: number;
}

export class CreatePassTemplateDto {
  @ApiProperty({ example: '10 Alkalmas Reformer Bérlet' })
  @IsString()
  @IsNotEmpty({ message: 'A bérletsablon nevének megadása kötelező.' })
  name: string;

  @ApiPropertyOptional({ description: 'Kapcsolódó szolgáltatás azonosítója' })
  @IsOptional()
  @IsString()
  serviceId?: string | null;

  @ApiProperty({ enum: PassType })
  @IsEnum(PassType)
  type: PassType;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalPasses?: number | null;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(1)
  durationDays: number;

  @ApiProperty({ example: 54000 })
  @IsNumber()
  @Min(0)
  price: number;
}

export class UpdatePassTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SellPassDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'A vendég azonosító megadása kötelező.' })
  guestId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'A bérletsablon kiválasztása kötelező.' })
  passTemplateId: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Opcionális egyedi kezdődátum (ISO string). Alapértelmezett: most.',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Opcionális egyedi fizetési összeg (pl. kedvezmény esetén).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  customAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class ExtendPassDto {
  @ApiProperty({ example: 14, description: 'Hány nappal hosszabbítjuk meg a bérletet' })
  @IsInt()
  @Min(1, { message: 'Legalább 1 nappal kell meghosszabbítani a bérletet.' })
  additionalDays: number;

  @ApiProperty({ example: 'Sérülés miatti igazolt hiányzás' })
  @IsString()
  @IsNotEmpty({ message: 'A hosszabbítás okának megadása kötelező.' })
  note: string;
}

export class ToggleFreezePassDto {
  @ApiPropertyOptional({ example: 'Utazás / betegség miatti szüneteltetés' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class DeductPassUsageDto {
  @ApiProperty({ description: 'Vendég azonosítója' })
  @IsString()
  @IsNotEmpty()
  guestId: string;

  @ApiProperty({ description: 'Kiválasztott aktív bérlet azonosítója' })
  @IsString()
  @IsNotEmpty()
  passId: string;

  @ApiProperty({ description: 'Kiválasztott kezelés (Service) azonosítója' })
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @ApiPropertyOptional({
    description: 'Egyedi műveletazonosító dupla kérés / versenyhelyzet ellen',
  })
  @IsOptional()
  @IsString()
  operationKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class ReversePassUsageDto {
  @ApiProperty({ example: 'Téves bérlet vagy kezelés kiválasztás' })
  @IsString()
  @IsNotEmpty({ message: 'A visszavonás indokának megadása kötelező.' })
  reversalReason: string;
}
