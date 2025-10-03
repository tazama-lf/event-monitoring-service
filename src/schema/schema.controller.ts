import { BadRequestException, Body, Controller, Get, HttpStatus, Param, Post } from '@nestjs/common';
import { SchemaService } from './schema.service';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import Ajv from 'ajv';

@Controller('/schemas')
export class SchemaController {
  private readonly ajv: Ajv;

  constructor(
    private readonly schemaService: SchemaService,
    private readonly logger: LoggerService,
  ) {
    this.ajv = new Ajv();
  }

  @Get('test')
  test(): any {
    const schema = {
      type: 'object',
      required: ['id', 'tags', 'amount'],
      properties: {
        id: {
          type: 'string',
        },
        tags: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        amount: {
          type: 'number',
        },
      },
      additionalProperties: false,
    };

    // this.logger.log(`type of schema: ${typeof schema}`);
    // this.logger.log(`type of configuredSchema: ${typeof { id: '123', tags: ['tag1', 'tag2'], amount: 55 }}`);

    this.ajv.validate(schema, { id: '123', tags: ['tag1', 'tag2'], amount: 55 });

    if (this.ajv.errors) {
      this.logger.log(`Validation errors: ${JSON.stringify(this.ajv.errors, null, 2)}`);
      return {
        valid: false,
        errors: this.ajv.errors,
      };
    }

    this.logger.log('Validation successful');
    return { valid: true };
  }

  @Post('*endpoint')
  async lookup(@Param('endpoint') endpoint: string, @Body() lookupDto: any): Promise<any> {
    this.logger.log(`Received request for endpoint: ${endpoint}`);

    const transformedEndpoint = '/' + endpoint.toString().replaceAll(',', '/');

    this.logger.log(`Transformed endpoint: ${transformedEndpoint}`);

    const result = await this.schemaService.lookupAndCompare(lookupDto, transformedEndpoint);

    if (!result.isMatch) {
      this.logger.log(`Schema mismatch: ${result.message}`);
      throw new BadRequestException({
        message: result.message,
        differences: result.differences,
        schema: result.schema,
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    this.logger.log(`Schema match: ${result.message}`);
    return {
      message: result.message,
      isMatch: result.isMatch,
      schema: result.schema,
      statusCode: HttpStatus.OK,
    };
  }
}
