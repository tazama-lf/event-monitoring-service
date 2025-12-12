# Node.js Clustering Configuration

This document explains how to configure and use Node.js clustering in the Event Monitoring Service using NestJS configuration management.

## Overview

The Event Monitoring Service supports Node.js clustering to improve performance by utilizing multiple CPU cores. The clustering feature is implemented through the `AppClusterService` which reads configuration from environment variables using NestJS's `@nestjs/config` package.

## Configuration

### Environment Variables

The clustering behavior is controlled by the following environment variable:

| Variable  | Type   | Default | Description                                 |
| --------- | ------ | ------- | ------------------------------------------- |
| `MAX_CPU` | number | `1`     | Maximum number of worker processes to spawn |

### Example Configuration

Add the following to your `.env` file:

```bash
# Clustering Configuration
MAX_CPU=4  # Use up to 4 worker processes
```

### Automatic CPU Detection

The service automatically detects the number of available CPU cores and will use the **minimum** of:

- The configured `MAX_CPU` value
- The actual number of CPU cores available on the system

For example:

- If `MAX_CPU=8` but the system has only 4 cores → **4 workers** will be created
- If `MAX_CPU=2` and the system has 8 cores → **2 workers** will be created

## Usage

### Automatic Clustering Based on Environment

The service **automatically** enables clustering based on the `NODE_ENV` environment variable:

- **Production** (`NODE_ENV=production`): Clustering is **enabled** automatically
- **Development** (any other value): Single instance mode for easier debugging

No code changes are required! Simply set your environment variables:

```bash
# Production - enables clustering
NODE_ENV=production
MAX_CPU=4

# Development - single instance
NODE_ENV=development
MAX_CPU=1  # or any value, clustering won't activate
```

### Manual Override

If you need to force clustering in non-production environments (e.g., for testing), you can modify `main.ts`:

```typescript
// Force clustering regardless of NODE_ENV
const isProduction = true; // or process.env.FORCE_CLUSTERING === 'true'
```

## Implementation Details

### AppClusterService

The `AppClusterService` provides two methods for clustering:

#### 1. Static Method (Recommended)

```typescript
AppClusterService.clusterize(bootstrap);
```

- Creates a temporary NestJS application to access configuration
- Reads `MAX_CPU` from environment variables
- Spawns the appropriate number of worker processes
- Handles worker process failures with automatic restart

#### 2. Instance Method

```typescript
const clusterService = app.get(AppClusterService);
await clusterService.clusterizeInstance(bootstrap);
```

- Used when you already have access to a NestJS application instance
- Useful for advanced scenarios or custom bootstrapping logic

### Configuration Validation

The clustering configuration is validated through NestJS's built-in validation:

```typescript
export interface AppConfiguration {
  readonly maxCpu: number;
  // ... other config properties
}

export function validateEnvironment(config: Record<string, unknown>): AppConfiguration {
  return {
    maxCpu: parseInt(config.MAX_CPU as string, 10) || 1,
    // ... other validations
  };
}
```

## Process Management

### Master Process

The master process:

- Reads the clustering configuration
- Spawns the configured number of worker processes
- Monitors worker health and restarts failed workers
- Logs clustering information

### Worker Processes

Each worker process:

- Runs a complete instance of the NestJS application
- Handles incoming requests independently
- Shares the same port (Node.js handles load balancing)

## Troubleshooting

### Common Issues

#### 1. Configuration Not Loading

**Problem**: `MAX_CPU` configuration not being read

**Solution**:

- Ensure `.env` file exists and contains `MAX_CPU=<number>`
- Verify `ConfigModule.forRoot()` is configured in `app.module.ts`
- Check that `validateEnvironment` function is set as validator

#### 2. Too Many Workers

**Problem**: More workers created than expected

**Solution**:

- Check `MAX_CPU` value in environment
- Verify the Math.min logic in `AppClusterService`
- Consider system resource constraints

#### 3. Workers Not Starting

**Problem**: Master process starts but workers fail

**Solution**:

- Check worker process logs for errors
- Ensure all dependencies are properly configured
- Verify database/Redis connections work in worker processes

## Integration with CI/CD

When integrating with CI/CD pipelines:

- Ensure environment variables are set correctly for each stage
- Test clustering behavior in staging before production deployment
