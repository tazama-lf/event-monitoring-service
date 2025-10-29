import { BadRequestException, Body, Controller, UseGuards, HttpStatus, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { DemsEngineService, TransactionRelationship } from './dems-engine.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { isValidEndpointFormat, transformEndpoint } from '../utils/transform_endpoint';
import { TazamaAuthGuard } from '../auth/tazama-auth.guard';
import { RequireDemsWriteRole } from '../auth/auth.decorator';
import { User } from '../auth/user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { parseString, ParserOptions } from 'xml2js';

@Controller('/dems-engine')
@UseGuards(TazamaAuthGuard)
export class DemsEngineController {
  constructor(
    private readonly demsEngineService: DemsEngineService,
    private readonly logger: LoggerService,
  ) {}

  @Post('*endpoint')
  @RequireDemsWriteRole()
  async messageHandler(
    @Param('endpoint') endpoint: string,
    @Body() payload: any,
    @User() user: AuthenticatedUser,
    @Req() req: any,
  ): Promise<{
    message: string;
    isMatch: boolean;
    transactionRelationship: TransactionRelationship;
    schema: any;
    payload: any;
    statusCode: number;
  }> {
    if (isValidEndpointFormat(endpoint) === false) {
      throw new BadRequestException({
        message: 'Invalid endpoint format. Endpoint must be a non-empty string containing commas.',
      });
    }
    const transformedEndpoint = transformEndpoint(endpoint);
    let transformedPayload: any;

    this.logger.log(
      `Processing request for clientId: ${user.token.clientId}, tenantId: ${user.token.tenantId}, endpoint: ${transformedEndpoint}`,
    );

    console.log('Dems Engine Controller - Received Payload:', req.headers['content-type']);
    if (req.headers['content-type'] === 'application/xml' || req.headers['content-type'] === 'text/xml') {
      const options: ParserOptions = {
        explicitArray: false, // Don't wrap single values in arrays
        ignoreAttrs: false, // Include attributes
        mergeAttrs: true, // Merge attributes with element content
        explicitRoot: true, // Don't include root wrapper
        explicitChildren: true,
        normalize: true,
      };

      transformedPayload = await new Promise((resolve, reject) => {
        parseString(payload, options, (err, result) => {
          if (err) {
            console.log('Dems Engine Controller - XML Parsing Error:', err);
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
      console.log('Dems Engine Controller - Converted Payload:', transformedPayload);
    }

    const result = await this.demsEngineService.handleMessage(payload, transformedEndpoint, user.token.tenantId);
    console.log('Dems Engine Controller - Result:', result);

    if (!('success' in result)) {
      this.logger.log(`Problem is: ${result.message}`);

      if (result.message === 'Schema not found for the specified endpoint') {
        throw new NotFoundException({
          message: result.message,
          differences: result.differences,
          schema: result.schema,
        });
      }

      throw new BadRequestException({
        message: result.message,
        differences: result.differences,
        schema: result.schema,
        payload: transformedPayload,
      });
    }

    try {
      await this.demsEngineService.saveTransactionDataAndNotify(result.tazamaPayload, result.transactionType, result.endToEndId);
    } catch (error) {
      this.logger.error(`Failed to save transaction data or notify: ${String(error)}`);
      throw new BadRequestException({
        message: 'Error saving transaction data or sending notification',
        differences: [`Transaction processing failed: ${String(error)}`],
      });
    }

    this.logger.log(' transaction relationship', JSON.stringify(result.transactionRelationship));
    this.logger.log('data cache', result.dataCache);

    return {
      message: 'Everything is OK!',
      isMatch: true,
      transactionRelationship: result.transactionRelationship,
      schema: result.configuredSchema,
      payload: result.tazamaPayload,
      statusCode: HttpStatus.OK,
    };
  }
}
