# APM Integration for Event Monitoring Service

This directory contains the Application Performance Monitoring (APM) integration for the Event Monitoring Service using NestJS and Elastic APM.

## Overview

The APM integration provides:

- Automatic HTTP request/response transaction tracking
- Manual span instrumentation for custom operations
- Error capture and reporting
- Distributed tracing support
- NestJS-native dependency injection

## Components

### ApmModule

Global module that provides APM services throughout the application.

### ApmService

Injectable service that wraps the APM functionality from `@tazama-lf/frms-coe-lib`.

### ApmInterceptor

Global interceptor that automatically creates APM transactions for all HTTP requests.

### ApmDecorators

Utility decorators and base classes for manual instrumentation.

## Configuration

APM configuration is handled through environment variables via the `@tazama-lf/frms-coe-lib` configuration:

```env
APM_ACTIVE=true
APM_SERVICE_NAME=event-monitoring-service
APM_SECRET_TOKEN=your-secret-token
APM_URL=http://your-apm-server:8200
NODE_ENV=production
```

## Usage

### Automatic Transaction Tracking

All HTTP requests are automatically tracked with no additional code required. The interceptor:

- Creates transactions named as `{METHOD} {route}`
- Adds HTTP metadata (method, URL, status code, user agent)
- Captures and reports errors
- Sets appropriate outcomes (success/failure)

### Manual Span Instrumentation

#### Using the @ApmSpan Decorator

```typescript
import { Injectable } from '@nestjs/common';
import { ApmSpan } from './apm';

@Injectable()
export class MyService {
  @ApmSpan('database-query')
  async findUser(id: string) {
    // Your database query logic
    return await this.userRepository.findById(id);
  }

  @ApmSpan('external-api-call')
  async callExternalService(data: any) {
    // Your external API call
    return await this.httpService.post('/api/endpoint', data);
  }
}
```

#### Using the ApmInstrumented Base Class

```typescript
import { Injectable } from '@nestjs/common';
import { ApmInstrumented, ApmService } from './apm';

@Injectable()
export class MyService extends ApmInstrumented {
  constructor(apmService: ApmService) {
    super(apmService);
  }

  async processData(data: any) {
    return this.withSpan('data-processing', async () => {
      // Your processing logic
      const processed = await this.transformData(data);

      // Nested spans are supported
      return this.withSpan('data-validation', async () => {
        return this.validateData(processed);
      });
    });
  }

  syncOperation(input: string) {
    return this.withSpanSync('sync-operation', () => {
      // Your synchronous logic
      return input.toUpperCase();
    });
  }
}
```

#### Direct Service Usage

```typescript
import { Injectable } from '@nestjs/common';
import { ApmService } from './apm';

@Injectable()
export class MyService {
  constructor(private readonly apmService: ApmService) {}

  async customOperation() {
    const span = this.apmService.startSpan('custom-operation');

    try {
      // Your logic here
      const result = await this.doSomething();

      if (span) {
        span.setOutcome('success');
        span.addLabels({ 'operation.type': 'custom' });
      }

      return result;
    } catch (error) {
      if (span) {
        span.setOutcome('failure');
      }
      throw error;
    } finally {
      if (span) {
        span.end();
      }
    }
  }
}
```

## Integration

The APM module is automatically integrated into the application:

1. **ApmModule** is imported into the main AppModule as a global module
2. **ApmInterceptor** is registered globally in main.ts
3. **ApmService** is available for injection throughout the application

## Best Practices

1. **Use meaningful span names**: Choose descriptive names that help identify operations
2. **Don't over-instrument**: Focus on business-critical operations and potential bottlenecks
3. **Handle errors properly**: Always ensure spans are ended even when errors occur
4. **Use labels wisely**: Add relevant metadata to spans for better filtering and analysis
5. **Consider performance**: APM adds overhead, so use it judiciously in high-frequency operations

## Distributed Tracing

The APM service supports distributed tracing. Use `getCurrentTraceparent()` to get the current trace context for passing to downstream services:

```typescript
const traceParent = this.apmService.getCurrentTraceparent();
// Include this in headers when calling other services
headers['elastic-apm-traceparent'] = traceParent;
```

## Monitoring and Alerts

With this APM integration, you can monitor:

- HTTP request/response times and error rates
- Custom operation performance
- Error patterns and stack traces
- Service dependencies and call patterns
- Business metrics through custom spans

Set up alerts in your APM dashboard for:

- High error rates
- Slow response times
- Failed operations
- Service availability issues
