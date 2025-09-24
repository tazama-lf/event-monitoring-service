import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { TcsSimulationService, ConfigurationDto } from './tcs-simulation.service';

@Controller('tcs-simulation')
export class TcsSimulationController {
  constructor(private readonly tcsService: TcsSimulationService) {}

  @Post('create-config')
  async createConfiguration(@Body() dto: ConfigurationDto): Promise<{ id: string; message: string }> {
    return await this.tcsService.createConfiguration(dto);
  }

  @Get('configs/:configId')
  async getConfiguration(@Param('configId') configId: string, @Query('tenantId') tenantId: string): Promise<object | null> {
    if (!tenantId) {
      throw new Error('tenantId query parameter is required');
    }
    return await this.tcsService.getConfiguration(configId, tenantId);
  }

  @Get('configs')
  async getAllConfigurations(@Query('tenantId') tenantId?: string): Promise<object[]> {
    return await this.tcsService.getAllConfigurations(tenantId);
  }
}
