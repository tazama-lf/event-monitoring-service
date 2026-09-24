// SPDX-License-Identifier: Apache-2.0

import { processRelatedTransactionMapping } from '../../src/utils/related-transaction.utils';

describe('processRelatedTransactionMapping', () => {
  const configuredMapping = [{ source: ['FIToFIPmtSts.TxInfAndSts.OrgnlEndToEndId'], destination: 'transactionDetails.EndToEndId' }];
  const relatedMapping = [{ source: ['FIToFICstmrCdtTrf.CdtTrfTxInf.PmtId.EndToEndId'], destination: 'transactionDetails.EndToEndId' }];
  const relatedTransaction = '/DEFAULT/v1/iso20022/pacs.008.001.10';
  const tenantId = 'DEFAULT';
  const endToEndId = 'E2E-TEST-123';

  const makeLoggerService = () => ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  });

  const makeEnhancedRequest = () => ({
    FIToFIPmtSts: { TxInfAndSts: { OrgnlEndToEndId: endToEndId } },
    DataCache: {},
  });

  it('does nothing (relatedTransactionBoolean stays false) when there is no relatedMapping', async () => {
    const loggerService = makeLoggerService();
    const databaseOperationsService = { getTransaction: jest.fn() } as any;
    const processMappings = jest.fn();

    const result = await processRelatedTransactionMapping({
      relatedMapping: null,
      relatedTransaction,
      configuredMapping,
      enhancedRequest: makeEnhancedRequest(),
      tenantId,
      loggerService: loggerService as any,
      logContext: 'test',
      databaseOperationsService,
      processMappings,
    });

    expect(result.relatedTransactionBoolean).toBe(false);
    expect(databaseOperationsService.getTransaction).not.toHaveBeenCalled();
    expect(processMappings).not.toHaveBeenCalled();
  });

  it('on a Redis cache HIT: uses the cached DataCache and skips the database entirely', async () => {
    const loggerService = makeLoggerService();
    const cachedDataCache = { dbtrId: 'John', cdtrAcctId: 'acct-001', instdAmt: 100.5 };
    const redisService = { getJson: jest.fn().mockResolvedValue(JSON.stringify(cachedDataCache)) } as any;
    const databaseOperationsService = { getTransaction: jest.fn() } as any;
    const processMappings = jest.fn();

    const result = await processRelatedTransactionMapping({
      relatedMapping,
      relatedTransaction,
      configuredMapping,
      enhancedRequest: makeEnhancedRequest(),
      tenantId,
      loggerService: loggerService as any,
      logContext: 'test',
      databaseOperationsService,
      processMappings,
      redisService,
    });

    expect(redisService.getJson).toHaveBeenCalledWith(`data-cache:${tenantId}:${endToEndId}`);
    expect(databaseOperationsService.getTransaction).not.toHaveBeenCalled();
    expect(processMappings).not.toHaveBeenCalled();
    expect(result.relatedTransactionBoolean).toBe(true);
    expect(result.enhancedRequest.DataCache).toMatchObject(cachedDataCache);
  });

  it('on a Redis cache MISS (empty string, matching RedisService.getJson): falls back to the database', async () => {
    const loggerService = makeLoggerService();
    const redisService = { getJson: jest.fn().mockResolvedValue('') } as any;
    const relatedPayload = { FIToFICstmrCdtTrf: { CdtTrfTxInf: { PmtId: { EndToEndId: endToEndId } } } };
    const databaseOperationsService = { getTransaction: jest.fn().mockResolvedValue(relatedPayload) } as any;
    const dbDataCache = { dbtrId: 'John', cdtrAcctId: 'acct-001' };
    const processMappings = jest.fn().mockResolvedValue({ dataCache: dbDataCache });

    const result = await processRelatedTransactionMapping({
      relatedMapping,
      relatedTransaction,
      configuredMapping,
      enhancedRequest: makeEnhancedRequest(),
      tenantId,
      loggerService: loggerService as any,
      logContext: 'test',
      databaseOperationsService,
      processMappings,
      redisService,
    });

    expect(redisService.getJson).toHaveBeenCalledWith(`data-cache:${tenantId}:${endToEndId}`);
    expect(databaseOperationsService.getTransaction).toHaveBeenCalledWith(endToEndId, tenantId, 'pacs008');
    expect(processMappings).toHaveBeenCalledWith(relatedPayload, relatedMapping, relatedTransaction, false);
    expect(result.relatedTransactionBoolean).toBe(true);
    expect(result.enhancedRequest.DataCache).toMatchObject(dbDataCache);
  });

  it('when redisService is not supplied at all: falls back to the database (backward compatible)', async () => {
    const loggerService = makeLoggerService();
    const relatedPayload = { FIToFICstmrCdtTrf: { CdtTrfTxInf: { PmtId: { EndToEndId: endToEndId } } } };
    const databaseOperationsService = { getTransaction: jest.fn().mockResolvedValue(relatedPayload) } as any;
    const dbDataCache = { dbtrId: 'John' };
    const processMappings = jest.fn().mockResolvedValue({ dataCache: dbDataCache });

    const result = await processRelatedTransactionMapping({
      relatedMapping,
      relatedTransaction,
      configuredMapping,
      enhancedRequest: makeEnhancedRequest(),
      tenantId,
      loggerService: loggerService as any,
      logContext: 'test',
      databaseOperationsService,
      processMappings,
      // no redisService
    });

    expect(databaseOperationsService.getTransaction).toHaveBeenCalledWith(endToEndId, tenantId, 'pacs008');
    expect(result.relatedTransactionBoolean).toBe(true);
    expect(result.enhancedRequest.DataCache).toMatchObject(dbDataCache);
  });

  it('when Redis throws (e.g. connection error): treats it as a miss and falls back to the database, never fails the request', async () => {
    const loggerService = makeLoggerService();
    const redisService = { getJson: jest.fn().mockRejectedValue(new Error('Redis connection refused')) } as any;
    const relatedPayload = { FIToFICstmrCdtTrf: { CdtTrfTxInf: { PmtId: { EndToEndId: endToEndId } } } };
    const databaseOperationsService = { getTransaction: jest.fn().mockResolvedValue(relatedPayload) } as any;
    const dbDataCache = { dbtrId: 'John' };
    const processMappings = jest.fn().mockResolvedValue({ dataCache: dbDataCache });

    const result = await processRelatedTransactionMapping({
      relatedMapping,
      relatedTransaction,
      configuredMapping,
      enhancedRequest: makeEnhancedRequest(),
      tenantId,
      loggerService: loggerService as any,
      logContext: 'test',
      databaseOperationsService,
      processMappings,
      redisService,
    });

    expect(databaseOperationsService.getTransaction).toHaveBeenCalledWith(endToEndId, tenantId, 'pacs008');
    expect(result.relatedTransactionBoolean).toBe(true);
    expect(result.enhancedRequest.DataCache).toMatchObject(dbDataCache);
    expect(loggerService.warn).toHaveBeenCalled();
  });

  it('when the cached value is corrupt JSON: treats it as a miss and falls back to the database', async () => {
    const loggerService = makeLoggerService();
    const redisService = { getJson: jest.fn().mockResolvedValue('{not valid json') } as any;
    const relatedPayload = { FIToFICstmrCdtTrf: { CdtTrfTxInf: { PmtId: { EndToEndId: endToEndId } } } };
    const databaseOperationsService = { getTransaction: jest.fn().mockResolvedValue(relatedPayload) } as any;
    const dbDataCache = { dbtrId: 'John' };
    const processMappings = jest.fn().mockResolvedValue({ dataCache: dbDataCache });

    const result = await processRelatedTransactionMapping({
      relatedMapping,
      relatedTransaction,
      configuredMapping,
      enhancedRequest: makeEnhancedRequest(),
      tenantId,
      loggerService: loggerService as any,
      logContext: 'test',
      databaseOperationsService,
      processMappings,
      redisService,
    });

    expect(databaseOperationsService.getTransaction).toHaveBeenCalledWith(endToEndId, tenantId, 'pacs008');
    expect(result.relatedTransactionBoolean).toBe(true);
    expect(result.enhancedRequest.DataCache).toMatchObject(dbDataCache);
  });

  it.each([
    ['an array', JSON.stringify([1, 2, 3])],
    ['a bare string', JSON.stringify('some-string')],
    ['a number', JSON.stringify(42)],
  ])('when the cached value is %s: treats it as a miss and falls back to the database', async (_label, cached) => {
    const loggerService = makeLoggerService();
    const redisService = { getJson: jest.fn().mockResolvedValue(cached) } as any;
    const relatedPayload = { FIToFICstmrCdtTrf: { CdtTrfTxInf: { PmtId: { EndToEndId: endToEndId } } } };
    const databaseOperationsService = { getTransaction: jest.fn().mockResolvedValue(relatedPayload) } as any;
    const dbDataCache = { dbtrId: 'John' };
    const processMappings = jest.fn().mockResolvedValue({ dataCache: dbDataCache });

    const result = await processRelatedTransactionMapping({
      relatedMapping,
      relatedTransaction,
      configuredMapping,
      enhancedRequest: makeEnhancedRequest(),
      tenantId,
      loggerService: loggerService as any,
      logContext: 'test',
      databaseOperationsService,
      processMappings,
      redisService,
    });

    // The database must still be consulted, and no character-indexed keys may leak into DataCache.
    expect(databaseOperationsService.getTransaction).toHaveBeenCalledWith(endToEndId, tenantId, 'pacs008');
    expect(result.enhancedRequest.DataCache).toMatchObject(dbDataCache);
    expect(result.enhancedRequest.DataCache).not.toHaveProperty('0');
    expect(loggerService.warn).toHaveBeenCalledWith(expect.stringContaining('non-object cached DataCache'), 'test');
  });

  it('merges cached/DB DataCache onto any pre-existing enhancedRequest.DataCache rather than replacing it', async () => {
    const loggerService = makeLoggerService();
    const cachedDataCache = { dbtrId: 'John' };
    const redisService = { getJson: jest.fn().mockResolvedValue(JSON.stringify(cachedDataCache)) } as any;
    const databaseOperationsService = { getTransaction: jest.fn() } as any;
    const processMappings = jest.fn();

    const enhancedRequest = makeEnhancedRequest();
    enhancedRequest.DataCache = { existingField: 'keep-me' };

    const result = await processRelatedTransactionMapping({
      relatedMapping,
      relatedTransaction,
      configuredMapping,
      enhancedRequest,
      tenantId,
      loggerService: loggerService as any,
      logContext: 'test',
      databaseOperationsService,
      processMappings,
      redisService,
    });

    expect(result.enhancedRequest.DataCache).toMatchObject({ existingField: 'keep-me', dbtrId: 'John' });
  });
});
