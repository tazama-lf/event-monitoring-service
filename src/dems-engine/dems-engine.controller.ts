import { BadRequestException, Body, Controller, UseGuards, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { DemsEngineService } from './dems-engine.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { isValidEndpointFormat, transformEndpoint, extractTenantIdFromEndpoint } from '../utils/transform_endpoint';
import { TazamaAuthGuard } from '../auth/tazama-auth.guard';
import { RequireDemsWriteRole } from '../auth/auth.decorator';
import { User } from '../auth/user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { MessageHandlerResponse } from '../interfaces/iMessagerHandlerResponse';
import { isXmlContentType } from '../utils/xml2js.utils';
import { ErrorResponse } from '../interfaces/iErrorResponse';
import { ProcessingResult } from '../interfaces/iProcessingResult';

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
    // The wildcard `*endpoint` capture is an ARRAY of path segments on this NestJS/Express version
    // for BOTH slash-delimited and comma-delimited request paths (verified against a live HTTP
    // request through the actual routing layer — see transform_endpoint.ts and
    // dems-engine.endpoint-routing.spec.ts). `unknown` here (rather than `string`) reflects that;
    // isValidEndpointFormat/transformEndpoint/extractTenantIdFromEndpoint normalize whichever shape
    // the router hands us.
    @Param('endpoint') endpoint: unknown,
    @Body() payload: any,
    @User() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MessageHandlerResponse> {
    if (!isValidEndpointFormat(endpoint)) {
      throw new BadRequestException({
        message:
          'Invalid endpoint format. Accepted formats: slash-delimited (e.g. /TAZAMA/v1/iso20022/pacs.008.001.10, ' +
          'matching the endpoint_path shown in the UI) or comma-delimited (e.g. TAZAMA,v1,iso20022,pacs.008.001.10).',
      });
    }
    const transformedEndpoint = transformEndpoint(endpoint);

    this.logger.log(
      `Processing request for clientId: ${user.token.clientId}, tenantId: ${user.token.tenantId}, endpoint: ${transformedEndpoint}`,
      this.LOG_CONTEXT,
    );

    // check the tenant_id from JWT token with the tenant_id in the URL
    const tenantIdFromUrl = extractTenantIdFromEndpoint(endpoint);
    if (user.token.tenantId !== tenantIdFromUrl) {
      this.logger.error(
        `Tenant ID mismatch: JWT tenantId ${user.token.tenantId} does not match URL tenantId ${tenantIdFromUrl}`,
        this.LOG_CONTEXT,
      );
      throw new BadRequestException('Tenant ID mismatch between JWT and endpoint URL');
    }

    const isPayloadXml = isXmlContentType(req);

    const result: ErrorResponse | ProcessingResult = await this.demsEngineService.handleMessage(
      payload,
      transformedEndpoint,
      user.token.tenantId,
      isPayloadXml,
    );

    if (!('success' in result)) {
      this.logger.log(`Problem is: ${result.message}`, this.LOG_CONTEXT);

      throw new BadRequestException({
        message: result.message,
        differences: result.differences,
        schema: result.schema,
      });
    }

    try {
      await this.demsEngineService.saveTransactionDataAndNotify(
        result.tazamaPayload,
        result.transactionType,
        result.endToEndId,
        result.trackedFields,
        result.persistencePayload,
      );
    } catch (error) {
      this.logger.error(`Failed to save transaction data or notify: ${String(error)}`);
      throw new BadRequestException({
        message: 'Error saving transaction data or sending notification',
        differences: ['Transaction processing failed. Please contact support if the issue persists.'],
      });
    }

    this.logger.log('Dynamic Mapping in Controller: ', result.dynamicMapping);

    // console.log('Configured Schema in Controller: ', result);

    return {
      message: 'Everything is OK!',
      isMatch: true,
      transactionRelationship: result.transactionRelationship,
      dynamicMapping: result.dynamicMapping,
      schema: result.configuredSchema,
      payload: result.tazamaPayload,
      trackedFields: result.trackedFields,
    };
  }
}
