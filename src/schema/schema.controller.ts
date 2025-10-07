import { BadRequestException, Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
import { SchemaService } from './schema.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { transformEndpoint } from '../utils/transform_endpoint';

@Controller('/schemas')
export class SchemaController {
  constructor(
    private readonly schemaService: SchemaService,
    private readonly logger: LoggerService,
  ) {}

  @Post('*endpoint')
  async MessageHandler(@Param('endpoint') endpoint: string, @Body() payload: any): Promise<any> {
    const transformedEndpoint = transformEndpoint(endpoint);

    const result = await this.schemaService.handleMessage(payload, transformedEndpoint);

    if (!result.isMatch) {
      this.logger.log(`Schema mismatch: ${result.message}`);
      throw new BadRequestException({
        message: result.message,
        differences: result.differences,
        schema: result.schema,
        statusCode: result.message === 'Schema not found for the specified endpoint' ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST,
      });
    }

    this.logger.log(`Schema match: ${result.message}`);

    return {
      message: result.message,
      isMatch: result.isMatch,
      schema: result.schema,
      payload: result.payload,
      statusCode: HttpStatus.OK,
    };
  }
}
