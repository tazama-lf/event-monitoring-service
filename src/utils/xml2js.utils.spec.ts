import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Request } from 'express';
import {
  returnArrayFieldsFromSchema,
  replaceObjectsWithArrays,
  convertNumberToStringAtPath,
  convertObjectToArrayAtPath,
  createSchemaAwareNumberProcessor,
  isXmlContentType,
} from './xml2js.utils';

describe('xml2js.utils', () => {
  let mockLoggerService: jest.Mocked<LoggerService>;

  beforeEach(() => {
    mockLoggerService = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('returnArrayFieldsFromSchema', () => {
    describe('Basic Schema Analysis', () => {
      it('should identify array fields in simple schema', async () => {
        const schema = {
          properties: {
            users: { type: 'array' },
            name: { type: 'string' },
            age: { type: 'number' },
          },
        };

        const result = await returnArrayFieldsFromSchema(schema);

        expect(result.arrayFields).toEqual(['users']);
        expect(result.stringFields).toEqual(['name']);
      });

      it('should identify nested object properties', async () => {
        const schema = {
          properties: {
            user: {
              type: 'object',
              properties: {
                profile: {
                  type: 'object',
                  properties: {
                    tags: { type: 'array' },
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
        };

        const result = await returnArrayFieldsFromSchema(schema);

        expect(result.arrayFields).toEqual(['user.profile.tags']);
        expect(result.stringFields).toEqual(['user.profile.name']);
      });

      it('should handle array items with object properties', async () => {
        const schema = {
          properties: {
            transactions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  amount: { type: 'number' },
                  metadata: {
                    type: 'object',
                    properties: {
                      notes: { type: 'array' },
                    },
                  },
                },
              },
            },
          },
        };

        const result = await returnArrayFieldsFromSchema(schema);

        expect(result.arrayFields).toEqual(['transactions', 'transactions.metadata.notes']);
        expect(result.stringFields).toEqual(['transactions.id']);
      });

      it('should handle empty schema', async () => {
        const schema = {};

        const result = await returnArrayFieldsFromSchema(schema);

        expect(result.arrayFields).toEqual([]);
        expect(result.stringFields).toEqual([]);
      });

      it('should handle schema without properties', async () => {
        const schema = { type: 'object' };

        const result = await returnArrayFieldsFromSchema(schema);

        expect(result.arrayFields).toEqual([]);
        expect(result.stringFields).toEqual([]);
      });
    });

    describe('Complex Schema Patterns', () => {
      it('should handle anyOf schemas', async () => {
        const schema = {
          properties: {
            data: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    items: { type: 'array' },
                    name: { type: 'string' },
                  },
                },
                {
                  type: 'object',
                  properties: {
                    values: { type: 'array' },
                    title: { type: 'string' },
                  },
                },
              ],
            },
          },
        };

        const result = await returnArrayFieldsFromSchema(schema);

        expect(result.arrayFields).toContain('data.items');
        expect(result.arrayFields).toContain('data.values');
        expect(result.stringFields).toContain('data.name');
        expect(result.stringFields).toContain('data.title');
      });

      it('should handle oneOf schemas', async () => {
        const schema = {
          properties: {
            payment: {
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    creditTransfers: { type: 'array' },
                  },
                },
                {
                  type: 'object',
                  properties: {
                    debitTransfers: { type: 'array' },
                  },
                },
              ],
            },
          },
        };

        const result = await returnArrayFieldsFromSchema(schema);

        expect(result.arrayFields).toContain('payment.creditTransfers');
        expect(result.arrayFields).toContain('payment.debitTransfers');
      });

      it('should handle allOf schemas', async () => {
        const schema = {
          properties: {
            document: {
              allOf: [
                {
                  type: 'object',
                  properties: {
                    headers: { type: 'array' },
                  },
                },
                {
                  type: 'object',
                  properties: {
                    transactions: { type: 'array' },
                    messageId: { type: 'string' },
                  },
                },
              ],
            },
          },
        };

        const result = await returnArrayFieldsFromSchema(schema);

        expect(result.arrayFields).toContain('document.headers');
        expect(result.arrayFields).toContain('document.transactions');
        expect(result.stringFields).toContain('document.messageId');
      });

      it('should handle root level schema variants', async () => {
        const schema = {
          anyOf: [
            {
              properties: {
                type1: { type: 'array' },
                name1: { type: 'string' },
              },
            },
            {
              properties: {
                type2: { type: 'array' },
                name2: { type: 'string' },
              },
            },
          ],
        };

        const result = await returnArrayFieldsFromSchema(schema);

        expect(result.arrayFields).toContain('type1');
        expect(result.arrayFields).toContain('type2');
        expect(result.stringFields).toContain('name1');
        expect(result.stringFields).toContain('name2');
      });
    });

    describe('Error Handling', () => {
      it('should throw and log error for invalid schema', async () => {
        const schema = null;

        await expect(returnArrayFieldsFromSchema(schema, mockLoggerService)).rejects.toThrow();
        expect(mockLoggerService.error).toHaveBeenCalled();
      });

      it('should handle schema with circular references gracefully', async () => {
        const schema: any = {
          properties: {
            self: {
              type: 'object',
              properties: {},
            },
          },
        };
        schema.properties.self.properties.recursive = schema.properties.self;

        const result = await returnArrayFieldsFromSchema(schema);
        expect(result.arrayFields).toEqual([]);
        expect(result.stringFields).toEqual([]);
      });

      it('should handle undefined properties gracefully', async () => {
        const schema = {
          properties: {
            field1: undefined,
            field2: { type: 'string' },
          },
        };

        const result = await returnArrayFieldsFromSchema(schema);
        expect(result.stringFields).toEqual(['field2']);
      });
    });

    describe('Real-world ISO20022 Schema', () => {
      it('should handle ISO20022 payment message schema', async () => {
        const iso20022Schema = {
          properties: {
            Document: {
              type: 'object',
              properties: {
                FIToFICstmrCdtTrf: {
                  type: 'object',
                  properties: {
                    GrpHdr: {
                      type: 'object',
                      properties: {
                        MsgId: { type: 'string' },
                        CreDtTm: { type: 'string' },
                      },
                    },
                    CdtTrfTxInf: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          PmtId: {
                            type: 'object',
                            properties: {
                              InstrId: { type: 'string' },
                              EndToEndId: { type: 'string' },
                            },
                          },
                          Cdtr: {
                            type: 'object',
                            properties: {
                              Nm: { type: 'string' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        };

        const result = await returnArrayFieldsFromSchema(iso20022Schema);

        expect(result.arrayFields).toContain('Document.FIToFICstmrCdtTrf.CdtTrfTxInf');
        expect(result.stringFields).toContain('Document.FIToFICstmrCdtTrf.GrpHdr.MsgId');
        expect(result.stringFields).toContain('Document.FIToFICstmrCdtTrf.CdtTrfTxInf.PmtId.InstrId');
      });
    });
  });

  describe('convertNumberToStringAtPath', () => {
    describe('Basic Conversions', () => {
      it('should convert number to string at simple path', () => {
        const obj = { count: 42 };
        convertNumberToStringAtPath(obj, 'count', mockLoggerService);

        expect(obj.count).toBe('42');

        expect(mockLoggerService.log).toHaveBeenCalledWith("Converted field 'count' from number to string: 42");
      });

      it('should convert number to string at nested path', () => {
        const obj = { data: { metrics: { count: 100 } } };
        convertNumberToStringAtPath(obj, 'data.metrics.count', mockLoggerService);

        expect(obj.data.metrics.count).toBe('100');
      });

      it('should not convert non-number values', () => {
        const obj = { name: 'test', active: true, value: null };

        convertNumberToStringAtPath(obj, 'name', mockLoggerService);
        convertNumberToStringAtPath(obj, 'active', mockLoggerService);
        convertNumberToStringAtPath(obj, 'value', mockLoggerService);

        expect(obj.name).toBe('test');
        expect(obj.active).toBe(true);
        expect(obj.value).toBe(null);
        expect(mockLoggerService.log).not.toHaveBeenCalled();
      });

      it('should handle non-existent paths gracefully', () => {
        const obj = { data: { count: 42 } };

        expect(() => {
          convertNumberToStringAtPath(obj, 'nonexistent.path', mockLoggerService);
        }).not.toThrow();

        expect(obj.data.count).toBe(42);
      });
    });

    describe('Edge Cases', () => {
      it('should handle zero values', () => {
        const obj = { count: 0 };
        convertNumberToStringAtPath(obj, 'count', mockLoggerService);
        expect(obj.count).toBe('0');
      });

      it('should handle negative numbers', () => {
        const obj = { balance: -100.5 };
        convertNumberToStringAtPath(obj, 'balance', mockLoggerService);
        expect(obj.balance).toBe('-100.5');
      });

      it('should handle floating point numbers', () => {
        const obj = { price: 99.99 };
        convertNumberToStringAtPath(obj, 'price', mockLoggerService);
        expect(obj.price).toBe('99.99');
      });

      it('should handle very large numbers', () => {
        const obj = { bigNumber: 9007199254740991 };
        convertNumberToStringAtPath(obj, 'bigNumber', mockLoggerService);
        expect(obj.bigNumber).toBe('9007199254740991');
      });

      it('should handle scientific notation', () => {
        const obj = { scientific: 1e10 };
        convertNumberToStringAtPath(obj, 'scientific', mockLoggerService);
        expect(obj.scientific).toBe('10000000000');
      });
    });

    describe('Error Handling', () => {
      it('should handle and log errors gracefully', () => {
        const obj = null;

        expect(() => {
          convertNumberToStringAtPath(obj, 'any.path', mockLoggerService);
        }).toThrow();

        expect(mockLoggerService.error).toHaveBeenCalled();
      });

      it('should continue execution after path not found', () => {
        const obj = { data: {} };

        expect(() => {
          convertNumberToStringAtPath(obj, 'data.missing.path', mockLoggerService);
        }).not.toThrow();
      });
    });
  });

  describe('convertObjectToArrayAtPath', () => {
    describe('Basic Conversions', () => {
      it('should convert object to array at simple path', () => {
        const obj = { item: { id: 1, name: 'test' } };
        convertObjectToArrayAtPath(obj, 'item', mockLoggerService);

        expect(Array.isArray(obj.item)).toBe(true);
        expect(obj.item).toEqual([{ id: 1, name: 'test' }]);

        expect(mockLoggerService.log).toHaveBeenCalledWith("Converted field 'item' from object to array");
      });

      it('should convert object to array at nested path', () => {
        const obj = {
          data: {
            transactions: {
              payment: { id: 'tx1', amount: 100 },
            },
          },
        };

        convertObjectToArrayAtPath(obj, 'data.transactions.payment', mockLoggerService);

        expect(Array.isArray(obj.data.transactions.payment)).toBe(true);
        expect(obj.data.transactions.payment).toEqual([{ id: 'tx1', amount: 100 }]);
      });

      it('should not convert if field is already an array', () => {
        const obj = { items: [{ id: 1 }, { id: 2 }] };
        convertObjectToArrayAtPath(obj, 'items', mockLoggerService);

        expect(obj.items).toEqual([{ id: 1 }, { id: 2 }]);
        expect(mockLoggerService.log).not.toHaveBeenCalled();
      });

      it('should not convert primitive values', () => {
        const obj = { name: 'test', count: 42, active: true };

        convertObjectToArrayAtPath(obj, 'name', mockLoggerService);
        convertObjectToArrayAtPath(obj, 'count', mockLoggerService);
        convertObjectToArrayAtPath(obj, 'active', mockLoggerService);

        expect(obj.name).toBe('test');
        expect(obj.count).toBe(42);
        expect(obj.active).toBe(true);
        expect(mockLoggerService.log).not.toHaveBeenCalled();
      });

      it('should handle non-existent paths gracefully', () => {
        const obj = { data: { count: 42 } };

        expect(() => {
          convertObjectToArrayAtPath(obj, 'nonexistent.path', mockLoggerService);
        }).not.toThrow();
      });
    });

    describe('Complex Object Conversions', () => {
      it('should convert nested objects', () => {
        const obj = {
          document: {
            payment: {
              id: 'pay1',
              amount: { value: 100, currency: 'USD' },
              parties: {
                debtor: { name: 'John' },
                creditor: { name: 'Jane' },
              },
            },
          },
        };

        convertObjectToArrayAtPath(obj, 'document.payment', mockLoggerService);

        expect(Array.isArray(obj.document.payment)).toBe(true);
        expect(obj.document.payment[0]).toEqual({
          id: 'pay1',
          amount: { value: 100, currency: 'USD' },
          parties: {
            debtor: { name: 'John' },
            creditor: { name: 'Jane' },
          },
        });
      });

      it('should handle empty objects', () => {
        const obj = { empty: {} };
        convertObjectToArrayAtPath(obj, 'empty', mockLoggerService);

        expect(Array.isArray(obj.empty)).toBe(true);
        expect(obj.empty).toEqual([{}]);
      });
    });

    describe('Error Handling', () => {
      it('should handle and log errors gracefully', () => {
        const obj = null;

        expect(() => {
          convertObjectToArrayAtPath(obj, 'any.path', mockLoggerService);
        }).toThrow();

        expect(mockLoggerService.error).toHaveBeenCalled();
      });
    });
  });

  describe('replaceObjectsWithArrays', () => {
    describe('Complete Transformations', () => {
      it('should apply both array and string transformations', () => {
        const payload = {
          transaction: {
            id: 123,
            payment: { amount: 100, currency: 'USD' },
            metadata: { notes: 'test notes' },
          },
        };

        const arrayFields = ['transaction.payment'];
        const stringFields = ['transaction.id'];

        const result = replaceObjectsWithArrays(payload, arrayFields, stringFields, mockLoggerService);

        expect(result.transaction.id).toBe('123');
        expect(Array.isArray(result.transaction.payment)).toBe(true);
        expect(result.transaction.payment[0]).toEqual({ amount: 100, currency: 'USD' });
        expect(result.transaction.metadata.notes).toBe('test notes');
      });

      it('should create deep copy without mutating original', () => {
        const payload = {
          count: 42,
          item: { id: 1, name: 'test' },
        };

        const result = replaceObjectsWithArrays(payload, ['item'], ['count'], mockLoggerService);

        expect(payload.count).toBe(42);
        expect(typeof payload.item).toBe('object');
        expect(Array.isArray(payload.item)).toBe(false);

        expect(result.count).toBe('42');
        expect(Array.isArray(result.item)).toBe(true);
      });

      it('should handle empty field arrays', () => {
        const payload = { data: 'test' };
        const result = replaceObjectsWithArrays(payload, [], [], mockLoggerService);

        expect(result).toEqual(payload);
        expect(result).not.toBe(payload);
      });

      it('should handle complex nested transformations', () => {
        const payload = {
          document: {
            header: {
              messageId: 12345,
              transactions: {
                payment: { id: 'pay1', amount: 100 },
              },
            },
          },
        };

        const arrayFields = ['document.header.transactions.payment'];
        const stringFields = ['document.header.messageId'];

        const result = replaceObjectsWithArrays(payload, arrayFields, stringFields, mockLoggerService);

        expect(result.document.header.messageId).toBe('12345');
        expect(Array.isArray(result.document.header.transactions.payment)).toBe(true);
      });
    });

    describe('Error Handling', () => {
      it('should handle and log errors gracefully', () => {
        const payload = null;

        expect(() => {
          replaceObjectsWithArrays(payload, ['field'], ['field'], mockLoggerService);
        }).toThrow();

        expect(mockLoggerService.error).toHaveBeenCalled();
      });

      it('should handle invalid field paths gracefully', () => {
        const payload = { data: 'test' };

        expect(() => {
          replaceObjectsWithArrays(payload, ['nonexistent.path'], ['another.missing'], mockLoggerService);
        }).not.toThrow();
      });
    });
  });

  describe('createSchemaAwareNumberProcessor', () => {
    describe('Number Processing Logic', () => {
      it('should convert numeric strings to numbers when not in string fields', () => {
        const processor = createSchemaAwareNumberProcessor(['keepString']);

        expect(processor('123', 'amount')).toBe(123);
        expect(processor('45.67', 'price')).toBe(45.67);
        expect(processor('0', 'count')).toBe(0);
      });

      it('should keep strings as strings when in string fields set', () => {
        const processor = createSchemaAwareNumberProcessor(['id', 'reference']);

        expect(processor('123', 'id')).toBe('123');
        expect(processor('456', 'reference')).toBe('456');
        expect(processor('789', 'amount')).toBe(789);
      });

      it('should handle non-numeric strings', () => {
        const processor = createSchemaAwareNumberProcessor([]);

        expect(processor('abc', 'field')).toBe('abc');
        expect(processor('12abc', 'field')).toBe('12abc');
        expect(processor('', 'field')).toBe('');
        expect(processor(' ', 'field')).toBe(' ');
      });

      it('should handle special numeric cases', () => {
        const processor = createSchemaAwareNumberProcessor([]);

        expect(processor('0', 'field')).toBe(0);
        expect(processor('-123', 'field')).toBe(-123);
        expect(processor('123.456', 'field')).toBe(123.456);
        expect(processor('1e10', 'field')).toBe(1e10);
        expect(processor('Infinity', 'field')).toBe(Infinity);
        expect(processor('-Infinity', 'field')).toBe(-Infinity);
      });

      it('should handle nested path awareness', () => {
        const processor = createSchemaAwareNumberProcessor(['user.id', 'payment.reference']);

        expect(processor('123', 'id', 'user')).toBe('123');
        expect(processor('456', 'reference', 'payment')).toBe('456');
        expect(processor('789', 'amount', 'payment')).toBe(789);
        expect(processor('999', 'id', 'transaction')).toBe(999);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty string fields array', () => {
        const processor = createSchemaAwareNumberProcessor([]);

        expect(processor('123', 'anyField')).toBe(123);
        expect(processor('abc', 'anyField')).toBe('abc');
      });

      it('should handle whitespace in numeric strings', () => {
        const processor = createSchemaAwareNumberProcessor([]);

        expect(processor(' 123 ', 'field')).toBe(' 123 ');
        expect(processor('123 ', 'field')).toBe('123 ');
        expect(processor(' 123', 'field')).toBe(' 123');
      });

      it('should handle NaN cases', () => {
        const processor = createSchemaAwareNumberProcessor([]);

        expect(processor('NaN', 'field')).toBe('NaN');
        expect(processor('not-a-number', 'field')).toBe('not-a-number');
      });

      it('should handle non-string inputs', () => {
        const processor = createSchemaAwareNumberProcessor([]);

        expect(processor(123, 'field')).toBe(123);
        expect(processor(true, 'field')).toBe(true);
        expect(processor(null, 'field')).toBe(null);
        expect(processor(undefined, 'field')).toBe(undefined);
      });
    });

    describe('Performance', () => {
      it('should handle large string field sets efficiently', () => {
        const largeStringFields = Array.from({ length: 10000 }, (_, i) => `field${i}`);
        const processor = createSchemaAwareNumberProcessor(largeStringFields);

        const startTime = Date.now();
        for (let i = 0; i < 1000; i++) {
          processor('123', `field${i % 100}`);
        }
        const endTime = Date.now();

        expect(endTime - startTime).toBeLessThan(100);
      });
    });
  });

  describe('isXmlContentType', () => {
    describe('Valid XML Content Types', () => {
      it('should return true for application/xml', () => {
        const req = {
          headers: { 'content-type': 'application/xml' },
        } as Request;

        const result = isXmlContentType(req, mockLoggerService);
        expect(result).toBe(true);
      });

      it('should return false for application/json', () => {
        const req = {
          headers: { 'content-type': 'application/json' },
        } as Request;

        const result = isXmlContentType(req, mockLoggerService);
        expect(result).toBe(false);
      });

      it('should return false for text/plain', () => {
        const req = {
          headers: { 'content-type': 'text/plain' },
        } as Request;

        const result = isXmlContentType(req, mockLoggerService);
        expect(result).toBe(false);
      });

      it('should return false when content-type header is missing', () => {
        const req = {
          headers: {},
        } as Request;

        const result = isXmlContentType(req, mockLoggerService);
        expect(result).toBe(false);
      });

      it('should return false for undefined content-type', () => {
        const req = {
          headers: { 'content-type': undefined },
        } as any;

        const result = isXmlContentType(req, mockLoggerService);
        expect(result).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should return false for similar but different content types', () => {
        const contentTypes = [
          'application/xml; charset=utf-8',
          'text/xml',
          'application/soap+xml',
          'application/xml-dtd',
          'APPLICATION/XML',
        ];

        contentTypes.forEach((contentType) => {
          const req = {
            headers: { 'content-type': contentType },
          } as Request;

          const result = isXmlContentType(req, mockLoggerService);
          expect(result).toBe(false);
        });
      });

      it('should be case sensitive', () => {
        const req = {
          headers: { 'content-type': 'APPLICATION/XML' },
        } as Request;

        const result = isXmlContentType(req, mockLoggerService);
        expect(result).toBe(false);
      });

      it('should handle empty string content-type', () => {
        const req = {
          headers: { 'content-type': '' },
        } as Request;

        const result = isXmlContentType(req, mockLoggerService);
        expect(result).toBe(false);
      });
    });

    describe('Error Handling', () => {
      it('should handle and log errors gracefully', () => {
        const req = null as any;

        expect(() => {
          isXmlContentType(req, mockLoggerService);
        }).toThrow();

        expect(mockLoggerService.error).toHaveBeenCalled();
      });

      it('should handle malformed request objects', () => {
        const req = { headers: null } as any;

        expect(() => {
          isXmlContentType(req, mockLoggerService);
        }).toThrow();
      });
    });
  });

  describe('Integration Tests', () => {
    it('should work together in XML processing workflow', async () => {
      const schema = {
        properties: {
          document: {
            type: 'object',
            properties: {
              transactions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    amount: { type: 'number' },
                  },
                },
              },
              messageId: { type: 'string' },
            },
          },
        },
      };

      const { arrayFields, stringFields } = await returnArrayFieldsFromSchema(schema);

      const payload = {
        document: {
          messageId: 12345,
          transactions: {
            id: 'tx123',
            amount: 100.5,
          },
        },
      };

      const result = replaceObjectsWithArrays(payload, arrayFields, stringFields, mockLoggerService);

      expect(result.document.messageId).toBe('12345');
      expect(Array.isArray(result.document.transactions)).toBe(true);
      expect(result.document.transactions[0].id).toBe('tx123');
    });

    it('should handle complete ISO20022 processing workflow', async () => {
      const iso20022Schema = {
        properties: {
          Document: {
            type: 'object',
            properties: {
              FIToFICstmrCdtTrf: {
                type: 'object',
                properties: {
                  GrpHdr: {
                    type: 'object',
                    properties: {
                      MsgId: { type: 'string' },
                      NbOfTxs: { type: 'string' },
                    },
                  },
                  CdtTrfTxInf: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        PmtId: {
                          type: 'object',
                          properties: {
                            InstrId: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const { arrayFields, stringFields } = await returnArrayFieldsFromSchema(iso20022Schema);

      const xmlPayload = {
        Document: {
          FIToFICstmrCdtTrf: {
            GrpHdr: {
              MsgId: 20240101001,
              NbOfTxs: 1,
            },
            CdtTrfTxInf: {
              PmtId: {
                InstrId: 'INSTR001',
              },
            },
          },
        },
      };

      const processed = replaceObjectsWithArrays(xmlPayload, arrayFields, stringFields, mockLoggerService);

      expect(processed.Document.FIToFICstmrCdtTrf.GrpHdr.MsgId).toBe('20240101001');
      expect(processed.Document.FIToFICstmrCdtTrf.GrpHdr.NbOfTxs).toBe('1');
      expect(Array.isArray(processed.Document.FIToFICstmrCdtTrf.CdtTrfTxInf)).toBe(true);
      expect(processed.Document.FIToFICstmrCdtTrf.CdtTrfTxInf[0].PmtId.InstrId).toBe('INSTR001');
    });
  });
});
