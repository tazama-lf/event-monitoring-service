# Single Source of Truth Migration

## Overview

This document tracks the migration from duplicate database operation methods to using frms-coe-lib as the single source of truth for database operations.

## Problem

Currently, there are two sources of truth for database operations:

1. `event-monitoring-service/src/commons/database-operations.service.ts` - Local implementation
2. `frms-coe-lib/src/builders/eventHistoryBuilder.ts` - Centralized implementation

## Goal

Make frms-coe-lib the single source of truth by:

1. Adding event history database manager to the service
2. Replacing local database operations with centralized ones
3. Maintaining the same public API surface

## Implementation Steps

### Step 1: Add required imports and dependencies ✅

- Import EventHistoryDB interface and related types ✅
- Import eventHistoryBuilder from frms-coe-lib ✅
- Import CreateDatabaseManager for initialization ✅

### Step 2: Initialize EventHistoryDB manager ✅

- Add eventHistoryManager property to DatabaseOperationsService ✅
- Create initialization method for event history database ✅
- Configure database connection using environment variables ✅

### Step 3: Replace addAccount method ✅

- Update addAccount to use eventHistoryManager.saveAccount ✅
- Maintain existing error handling and logging ✅
- Ensure same behavior for external consumers ✅

### Step 4: Add similar methods for consistency ✅

- Replace addEntity with eventHistoryManager.saveEntity ✅
- Replace addAccountHolder with eventHistoryManager.saveAccountHolder ✅
- Consider other database operations for future migration

## Technical Implementation Details

### Database Configuration Mapping

The service maps existing environment variables to frms-coe-lib expected format:

- `DB_HOST` → `host`
- `DB_PORT` → `port`
- `DB_NAME` → `databaseName`
- `DB_USER` → `user`
- `DB_PASSWORD` → `password`
- `DB_CERT_PATH` → `certPath`

### Graceful Fallback Strategy

- Each method checks if `eventHistoryManager` is available
- If initialization failed, methods fall back to direct database queries
- This ensures backward compatibility and resilience

### Methods Migrated

1. `addAccount(accountId: string, tenantId: string)`
   - Uses `eventHistoryManager.saveAccount()` from frms-coe-lib
   - Fallback: Direct SQL INSERT with ON CONFLICT DO NOTHING

2. `addEntity(entityId: string, tenantId: string, CreDtTm: string)`
   - Uses `eventHistoryManager.saveEntity()` from frms-coe-lib
   - Fallback: Direct SQL INSERT with ON CONFLICT DO NOTHING

3. `addAccountHolder(entityId: string, accountId: string, CreDtTm: string, tenantId: string)`
   - Uses `eventHistoryManager.saveAccountHolder()` from frms-coe-lib
   - Fallback: Direct SQL INSERT with ON CONFLICT DO NOTHING

### Benefits Achieved

- ✅ Single source of truth for database operations
- ✅ Consistent SQL patterns across all services
- ✅ Centralized database connection management
- ✅ Reduced code duplication
- ✅ Backward compatibility maintained
- ✅ Graceful degradation if frms-coe-lib is unavailable

## Validation Results

- ✅ TypeScript compilation passes without errors
- ✅ All imports resolve correctly from frms-coe-lib
- ✅ Service initialization method properly configured
- ✅ Method signatures remain unchanged for external consumers
- ✅ Error handling preserved from original implementation

## Next Steps

1. Update other services to follow same pattern
2. Consider migrating `saveTransactionRelationship` method
3. Add integration tests to verify frms-coe-lib integration
4. Update environment variable documentation
5. Consider removing direct database queries once all services are migrated

## Files Modified

- ✅ `/src/commons/database-operations.service.ts` - Main implementation
- ✅ `/docs/single-source-of-truth.md` - Documentation

## Rollback Plan

If issues arise, the fallback mechanism ensures that:

1. Methods will use direct database operations if frms-coe-lib fails to initialize
2. All existing functionality remains intact
3. No breaking changes to external API surface
