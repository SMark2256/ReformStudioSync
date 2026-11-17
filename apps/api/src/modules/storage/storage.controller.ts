import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StorageService } from './storage.service';

/**
 * Helyi tároló letöltése (csak nem production módban, Supabase beállítás nélkül). A link
 * aláírt és lejár, ezért munkatársi token nélkül nyitható meg (böngészőfülben).
 */
@ApiTags('Fájltárolás (Storage)')
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('local/:token')
  @ApiOperation({ summary: 'Helyi tároló: lejáró, aláírt letöltési link (fejlesztéshez)' })
  async download(@Param('token') token: string, @Res() res: Response) {
    const key = this.storage.resolveLocalToken(token);
    const data = await this.storage.download(key);
    res.setHeader('Content-Type', key.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(data);
  }
}
