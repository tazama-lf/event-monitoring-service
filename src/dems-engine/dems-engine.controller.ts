import { BadRequestException, Body, Controller, UseGuards, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { DemsEngineService } from './dems-engine.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { isValidEndpointFormat, transformEndpoint } from '../utils/transform_endpoint';
import { TazamaAuthGuard } from '../auth/tazama-auth.guard';
import { RequireDemsWriteRole } from '../auth/auth.decorator';
import { User } from '../auth/user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { MessageHandlerResponse } from '../interfaces/iMessagerHandlerResponse';
import { isXmlContentType } from '../utils/xml2js.utils';

@Controller('/dems-engine')
@UseGuards(TazamaAuthGuard)
export class DemsEngineController {
  constructor(
    private readonly demsEngineService: DemsEngineService,
    private readonly logger: LoggerService,
  ) {}

  private readonly LOG_CONTEXT = DemsEngineController.name;

  @Post('*endpoint')
  @RequireDemsWriteRole()
  async messageHandler(
    @Param('endpoint') endpoint: string,
    @Body() payload: any,
    @User() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MessageHandlerResponse> {
    if (!isValidEndpointFormat(endpoint)) {
      throw new BadRequestException({
        message: 'Invalid endpoint format. Endpoint must be a non-empty string containing commas.',
      });
    }
    const transformedEndpoint = transformEndpoint(endpoint);

    this.logger.log(
      `Processing request for clientId: ${user.token.clientId}, tenantId: ${user.token.tenantId}, endpoint: ${transformedEndpoint}`,
      this.LOG_CONTEXT,
    );

    // check the tenant_id from JWT token with the tenant_id in the URL
    const tenantIdFromUrl = endpoint.split(',')[0];
    if (user.token.tenantId !== tenantIdFromUrl) {
      this.logger.error(
        `Tenant ID mismatch: JWT tenantId ${user.token.tenantId} does not match URL tenantId ${tenantIdFromUrl}`,
        this.LOG_CONTEXT,
      );
      throw new BadRequestException('Tenant ID mismatch between JWT and endpoint URL');
    }

    const isPayloadXml = isXmlContentType(req);

    const result = await this.demsEngineService.handleMessage(payload, transformedEndpoint, user.token.tenantId, isPayloadXml);

    if (!('success' in result)) {
      this.logger.log(`Problem is: ${result.message}`, this.LOG_CONTEXT);

      throw new BadRequestException({
        message: result.message,
        differences: result.differences,
        schema: result.schema,
      });
    }

    try {
      await this.demsEngineService.saveTransactionDataAndNotify(result.tazamaPayload, result.transactionType, result.endToEndId);
    } catch (error) {
      this.logger.error(`Failed to save transaction data or notify: ${String(error)}`);
      throw new BadRequestException({
        message: 'Error saving transaction data or sending notification',
        differences: ['Transaction processing failed. Please contact support if the issue persists.'],
      });
    }

    this.logger.log('Dynamic Mapping in Controller: ', result.dynamicMapping);

    return {
      message: 'Everything is OK!',
      isMatch: true,
      transactionRelationship: result.transactionRelationship,
      dynamicMapping: result.dynamicMapping,
      schema: result.configuredSchema,
      payload: result.tazamaPayload,
    };
  }
}
