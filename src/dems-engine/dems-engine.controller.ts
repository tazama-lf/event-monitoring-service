import { BadRequestException, Body, Controller, UseGuards, HttpStatus, NotFoundException, Param, Post } from '@nestjs/common';
import { DemsEngineService, TransactionRelationship } from './dems-engine.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { isValidEndpointFormat, transformEndpoint } from '../utils/transform_endpoint';
import { TazamaAuthGuard } from '../auth/tazama-auth.guard';
import { RequireDemsWriteRole } from '../auth/auth.decorator';
import { User } from '../auth/user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

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

    this.logger.log(
      `Processing request for clientId: ${user.token.clientId}, tenantId: ${user.token.tenantId}, endpoint: ${transformedEndpoint}`,
    );

    const result = await this.demsEngineService.handleMessage(payload, transformedEndpoint, user.token.tenantId);

    if (!result.isMatch) {
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
