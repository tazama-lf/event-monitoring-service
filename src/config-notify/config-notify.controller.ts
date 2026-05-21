import { Controller, Patch, Param, Body, ParseIntPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigNotifyService } from './config-notify.service';
import { UpdateCacheDto } from './update-cache.dto';
import { TazamaAuthGuard } from '../auth/tazama-auth.guard';
import { RequireDemsWriteRole } from '../auth/auth.decorator';

@Controller('config-notify')
@UseGuards(TazamaAuthGuard)
export class ConfigNotifyController {
  constructor(private readonly configNotifyService: ConfigNotifyService) {}

  @Patch(':id')
  @RequireDemsWriteRole()
  @HttpCode(HttpStatus.OK)
  async updateCache(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCacheDto): Promise<{ message: string }> {
    await this.configNotifyService.updateCache(id, body.publishing_status);
    return { message: `Cache updated successfully for config ID: ${id}` };
  }
}
