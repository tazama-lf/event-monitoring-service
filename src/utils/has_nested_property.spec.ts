import { getValueByPath } from './has_nested_property';

describe('getValueByPath', () => {
  const testObject = {
    glossary: {
      GlossDiv: {
        GlossList: {
          GlossEntry: {
            SortAs: 'SGML',
            GlossTerm: 'Standard Generalized Markup Language',
            Acronym: 'SGML',
            Abbrev: 'ISO 8879:1986',
            GlossDef: {
              para: 'A meta-markup language, used to create markup languages such as DocBook.',
              GlossSeeAlso: ['GML', 'XML'],
            },
            GlossSee: 'markup',
          },
        },
      },
    },
    users: [
      { id: 1, name: 'John', active: true },
      { id: 2, name: 'Jane', active: false },
      { id: 3, name: 'Bob', active: true },
    ],
    settings: {
      theme: 'dark',
      notifications: {
        email: true,
        sms: false,
        push: {
          enabled: true,
          frequency: 'daily',
        },
      },
    },
    emptyArray: [],
    emptyObject: {},
    nullValue: null,
    undefinedValue: undefined,
    zeroValue: 0,
    falseValue: false,
    emptyString: '',
  };

  describe('Simple Property Access', () => {
    it('should extract simple string property', () => {
      const result = getValueByPath<string>(testObject, 'glossary.GlossDiv.GlossList.GlossEntry.SortAs');
      expect(result).toBe('SGML');
    });

    it('should extract nested string property', () => {
      const result = getValueByPath<string>(testObject, 'settings.theme');
      expect(result).toBe('dark');
    });

    it('should extract boolean property', () => {
      const result = getValueByPath<boolean>(testObject, 'settings.notifications.email');
      expect(result).toBe(true);
    });

    it('should extract deeply nested property', () => {
      const result = getValueByPath<string>(testObject, 'settings.notifications.push.frequency');
      expect(result).toBe('daily');
    });
  });

  describe('Array Access', () => {
    it('should extract array element by index', () => {
      const result = getValueByPath<any>(testObject, 'users.0');
      expect(result).toEqual({ id: 1, name: 'John', active: true });
    });

    it('should extract property from array element', () => {
      const result = getValueByPath<string>(testObject, 'users.1.name');
      expect(result).toBe('Jane');
    });

    it('should extract boolean from array element', () => {
      const result = getValueByPath<boolean>(testObject, 'users.2.active');
      expect(result).toBe(true);
    });

    it('should extract number from array element', () => {
      const result = getValueByPath<number>(testObject, 'users.0.id');
      expect(result).toBe(1);
    });

    it('should extract array property', () => {
      const result = getValueByPath<string[]>(testObject, 'glossary.GlossDiv.GlossList.GlossEntry.GlossDef.GlossSeeAlso');
      expect(result).toEqual(['GML', 'XML']);
    });

    it('should extract specific array element', () => {
      const result = getValueByPath<string>(testObject, 'glossary.GlossDiv.GlossList.GlossEntry.GlossDef.GlossSeeAlso.1');
      expect(result).toBe('XML');
    });
  });

  describe('Complex Nested Access', () => {
    it('should handle mixed object and array navigation', () => {
      const complexObject = {
        data: {
          items: [{ metadata: { tags: ['tag1', 'tag2'] } }, { metadata: { tags: ['tag3', 'tag4'] } }],
        },
      };

      const result = getValueByPath<string>(complexObject, 'data.items.1.metadata.tags.0');
      expect(result).toBe('tag3');
    });

    it('should handle multiple array access levels', () => {
      const nestedArrayObject = {
        matrix: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ],
      };

      const result = getValueByPath<number>(nestedArrayObject, 'matrix.1.2');
      expect(result).toBe(6);
    });

    it('should handle object with numeric string keys', () => {
      const numericKeyObject = {
        '0': { value: 'first' },
        '1': { value: 'second' },
        'normal': { value: 'normal' },
      };

      const result1 = getValueByPath<string>(numericKeyObject, '0.value');
      const result2 = getValueByPath<string>(numericKeyObject, 'normal.value');

      expect(result1).toBe('first');
      expect(result2).toBe('normal');
    });
  });

  describe('Edge Cases and Special Values', () => {
    it('should handle zero values', () => {
      const result = getValueByPath<number>(testObject, 'zeroValue');
      expect(result).toBe(0);
    });

    it('should handle false boolean values', () => {
      const result = getValueByPath<boolean>(testObject, 'falseValue');
      expect(result).toBe(false);
    });

    it('should handle empty string values', () => {
      const result = getValueByPath<string>(testObject, 'emptyString');
      expect(result).toBe('');
    });

    it('should handle empty arrays', () => {
      const result = getValueByPath<any[]>(testObject, 'emptyArray');
      expect(result).toEqual([]);
    });

    it('should handle empty objects', () => {
      const result = getValueByPath<object>(testObject, 'emptyObject');
      expect(result).toEqual({});
    });

    it('should handle single property path', () => {
      const simpleObject = { key: 'value' };
      const result = getValueByPath<string>(simpleObject, 'key');
      expect(result).toBe('value');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when property does not exist', () => {
      expect(() => {
        getValueByPath(testObject, 'nonExistent.property');
      }).toThrow("Property 'nonExistent.property' not found");
    });

    it('should throw error when nested property does not exist', () => {
      expect(() => {
        getValueByPath(testObject, 'glossary.nonExistent.property');
      }).toThrow("Property 'glossary.nonExistent.property' not found");
    });

    it('should throw error when array index is out of bounds', () => {
      expect(() => {
        getValueByPath(testObject, 'users.10.name');
      }).toThrow("Property 'users.10.name' not found");
    });

    it('should throw error when accessing property on null', () => {
      expect(() => {
        getValueByPath(testObject, 'nullValue.property');
      }).toThrow("Property 'nullValue.property' not found");
    });

    it('should throw error when accessing property on undefined', () => {
      expect(() => {
        getValueByPath(testObject, 'undefinedValue.property');
      }).toThrow("Property 'undefinedValue.property' not found");
    });

    it('should throw error for empty path', () => {
      expect(() => {
        getValueByPath(testObject, '');
      }).toThrow("Property '' not found");
    });

    it('should throw error when trying to access property on primitive', () => {
      expect(() => {
        getValueByPath(testObject, 'settings.theme.length.invalid');
      }).toThrow("Property 'settings.theme.length.invalid' not found");
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety with generic parameter', () => {
      const stringResult: string = getValueByPath<string>(testObject, 'settings.theme');
      const booleanResult: boolean = getValueByPath<boolean>(testObject, 'settings.notifications.email');
      const numberResult: number = getValueByPath<number>(testObject, 'users.0.id');

      expect(typeof stringResult).toBe('string');
      expect(typeof booleanResult).toBe('boolean');
      expect(typeof numberResult).toBe('number');
    });

    it('should handle complex type extraction', () => {
      const objectResult = getValueByPath<{ id: number; name: string; active: boolean }>(testObject, 'users.0');
      expect(objectResult.id).toBe(1);
      expect(objectResult.name).toBe('John');
      expect(objectResult.active).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    it('should handle deep nesting efficiently', () => {
      const deepObject = { level1: { level2: { level3: { level4: { level5: { value: 'deep' } } } } } };

      const startTime = Date.now();
      const result = getValueByPath<string>(deepObject, 'level1.level2.level3.level4.level5.value');
      const endTime = Date.now();

      expect(result).toBe('deep');
      expect(endTime - startTime).toBeLessThan(10);
    });

    it('should handle large arrays efficiently', () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => ({ id: i, value: `item${i}` }));
      const objectWithLargeArray = { items: largeArray };

      const startTime = Date.now();
      const result = getValueByPath<string>(objectWithLargeArray, 'items.9999.value');
      const endTime = Date.now();

      expect(result).toBe('item9999');
      expect(endTime - startTime).toBeLessThan(10);
    });

    it('should not mutate the original object', () => {
      const originalValue = testObject.settings.theme;
      getValueByPath<string>(testObject, 'settings.theme');
      expect(testObject.settings.theme).toBe(originalValue);
    });
  });

  describe('Special Path Formats', () => {
    it('should handle paths with only numeric indices', () => {
      const arrayOfArrays = [
        [1, 2],
        [3, 4],
        [5, 6],
      ];
      const result = getValueByPath<number>(arrayOfArrays, '1.0');
      expect(result).toBe(3);
    });

    it('should handle mixed numeric and string properties', () => {
      const mixedObject = {
        0: { name: 'zero' },
        normal: { 0: 'nested zero' },
      };

      const result1 = getValueByPath<string>(mixedObject, '0.name');
      const result2 = getValueByPath<string>(mixedObject, 'normal.0');

      expect(result1).toBe('zero');
      expect(result2).toBe('nested zero');
    });

    it('should handle very long property paths', () => {
      const deepPath = Array.from({ length: 100 }, (_, i) => `level${i}`);
      let deepObject: any = { value: 'final' };

      for (let i = deepPath.length - 1; i >= 0; i--) {
        deepObject = { [deepPath[i]]: deepObject };
      }

      const path = deepPath.join('.') + '.value';
      const result = getValueByPath<string>(deepObject, path);
      expect(result).toBe('final');
    });
  });

  describe('Real-world Use Cases', () => {
    it('should extract ISO20022 message fields', () => {
      const iso20022Message = {
        Document: {
          FIToFICstmrCdtTrf: {
            GrpHdr: {
              MsgId: 'MSG123456',
              CreDtTm: '2024-01-01T00:00:00Z',
              NbOfTxs: '1',
            },
            CdtTrfTxInf: [
              {
                PmtId: {
                  InstrId: 'INSTR001',
                  EndToEndId: 'E2E001',
                },
                Amt: {
                  InstdAmt: {
                    Ccy: 'USD',
                    value: '100.00',
                  },
                },
              },
            ],
          },
        },
      };

      const msgId = getValueByPath<string>(iso20022Message, 'Document.FIToFICstmrCdtTrf.GrpHdr.MsgId');
      const currency = getValueByPath<string>(iso20022Message, 'Document.FIToFICstmrCdtTrf.CdtTrfTxInf.0.Amt.InstdAmt.Ccy');
      const amount = getValueByPath<string>(iso20022Message, 'Document.FIToFICstmrCdtTrf.CdtTrfTxInf.0.Amt.InstdAmt.value');

      expect(msgId).toBe('MSG123456');
      expect(currency).toBe('USD');
      expect(amount).toBe('100.00');
    });

    it('should extract configuration values', () => {
      const config = {
        database: {
          connections: {
            primary: {
              host: 'localhost',
              port: 5432,
              credentials: {
                username: 'user',
                password: 'pass',
              },
            },
          },
        },
      };

      const host = getValueByPath<string>(config, 'database.connections.primary.host');
      const port = getValueByPath<number>(config, 'database.connections.primary.port');
      const username = getValueByPath<string>(config, 'database.connections.primary.credentials.username');

      expect(host).toBe('localhost');
      expect(port).toBe(5432);
      expect(username).toBe('user');
    });
  });
});
