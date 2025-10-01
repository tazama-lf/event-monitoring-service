import { Controller, Get, Param } from '@nestjs/common';
import { ConfigNotifyService } from './config-notify.service';

@Controller('/internal/config')
export class ConfigNotifyController {
  constructor(private readonly service: ConfigNotifyService) {}

  @Get('cache/check/:tenantId/:msgFam/:msgType/:version')
  async checkCache(
    @Param('tenantId') tenantId: string,
    @Param('msgFam') msgFam: string,
    @Param('msgType') msgType: string,
    @Param('version') version: string,
  ): Promise<object> {
    return await this.service.getCachedConfig(tenantId, msgFam, msgType, version);
  }
}
