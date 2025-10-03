import { Controller, Get } from '@nestjs/common';
import { SchemaService } from './schema.service';

@Controller('/internal/schema')
export class SchemaController {
  constructor(private readonly service: SchemaService) {}

  @Get('test')
  test(): string {
    return 'Schema service is operational';
  }
}
