import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { RequireActivationRole } from '../auth/auth.decorator';
import { TazamaAuthGuard } from '../auth/tazama-auth.guard';
import { ConfigNotifyService } from './config-notify.service';
import { UpdateCacheDto } from './update-cache.dto';

@Controller('config-notify')
@UseGuards(TazamaAuthGuard)
export class ConfigNotifyController {
  constructor(private readonly configNotifyService: ConfigNotifyService) {}

  @Patch(':id')
  @RequireActivationRole()
  @HttpCode(HttpStatus.OK)
  async updateCache(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCacheDto): Promise<{ message: string }> {
    await this.configNotifyService.updateCache(id, body.publishing_status);
    return { message: `Cache updated successfully for config ID: ${id}` };
  }
}
