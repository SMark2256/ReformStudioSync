import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TOUR_ID_PATTERN, TOUR_STEP_MAX, TourEventDto } from '@reform/shared';
import { IsIn, IsInt, Matches, Max, Min, ValidateIf } from 'class-validator';

const TOUR_EVENT_KINDS: TourEventDto['kind'][] = ['seen', 'all', 'reset'];

/** `POST /tours` törzse; az `id` és a `step` csak a `seen` eseménynél kötelező. */
export class RecordTourEventDto {
  @ApiProperty({ enum: TOUR_EVENT_KINDS, example: 'seen' })
  @IsIn(TOUR_EVENT_KINDS)
  kind: TourEventDto['kind'];

  @ApiPropertyOptional({ example: 'recepcio-pult-v1' })
  @ValidateIf((dto: RecordTourEventDto) => dto.kind === 'seen')
  @Matches(TOUR_ID_PATTERN, { message: 'Érvénytelen bemutató-azonosító.' })
  id?: string;

  @ApiPropertyOptional({ example: 3, description: 'A lépés, amelynél bezárta.' })
  @ValidateIf((dto: RecordTourEventDto) => dto.kind === 'seen')
  @IsInt()
  @Min(0)
  @Max(TOUR_STEP_MAX)
  step?: number;
}
