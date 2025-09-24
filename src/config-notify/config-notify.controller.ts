import { Controller, Post, Body, HttpCode, HttpStatus, Get, Param, Query } from '@nestjs/common';
import { ConfigNotifyService } from './config-notify.service';
import { ConfigNotifyDto } from './dto/config-notify.dto';

@Controller('/internal/config')
export class ConfigNotifyController {
  constructor(private readonly service: ConfigNotifyService) {}

  @Post('notify')
  @HttpCode(HttpStatus.OK)
  async notify(@Body() dto: ConfigNotifyDto): Promise<{ status: string }> {
    await this.service.handleNotification(dto);
    return { status: 'ACK' };
  }

  @Get('cache/check/:tenantId/:configId/:version')
  async checkCache(
    @Param('tenantId') tenantId: string,
    @Param('configId') configId: string,
    @Param('version') version: string,
  ): Promise<object> {
    return await this.service.getCachedConfig(tenantId, configId, version);
  }

  @Get('cache/tenant/:tenantId')
  async getTenantCache(@Param('tenantId') tenantId: string): Promise<object> {
    return await this.service.getTenantConfigs(tenantId);
  }

  @Get('cache/all')
  async getAllCache(): Promise<object> {
    return await this.service.getAllCachedConfigs();
  }

  @Post('cache/clear')
  async clearCache(@Query('pattern') pattern?: string): Promise<object> {
    return await this.service.clearCache(pattern);
  }
}
