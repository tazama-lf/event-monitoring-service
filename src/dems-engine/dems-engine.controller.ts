import { BadRequestException, Body, Controller, Headers, HttpStatus, Param, Post } from '@nestjs/common';
import { DemsEngineService } from './dems-engine.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { transformEndpoint } from '../utils/transform_endpoint';
// import { AuthGuard } from '../auth/auth.guard';

@Controller('/dems-engine')
// @UseGuards(AuthGuard)
export class DemsEngineController {
  constructor(
    private readonly demsEngineService: DemsEngineService,
    private readonly logger: LoggerService,
  ) {}

  @Post('*endpoint')
  async MessageHandler(
    @Param('endpoint') endpoint: string,
    @Body() payload: any,
    @Headers('tenantId') tenantId: string,
  ): Promise<{ message: string; isMatch: boolean; transactionRelationship: any; schema: any; payload: any; statusCode: number }> {
    const transformedEndpoint = transformEndpoint(endpoint);

    const result = await this.demsEngineService.handleMessage(payload, transformedEndpoint, tenantId);

    if (!result.isMatch) {
      this.logger.log(`Problem is: ${result.message}`);
      throw new BadRequestException({
        message: result.message,
        differences: result.differences,
        schema: result.schema,
        statusCode: result.message === 'Schema not found for the specified endpoint' ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST,
      });
    }

    return {
      message: result.message,
      isMatch: result.isMatch,
      transactionRelationship: result.transactionRelationship,
      schema: result.schema,
      payload: result.payload,
      statusCode: HttpStatus.OK,
    };
  }
}
