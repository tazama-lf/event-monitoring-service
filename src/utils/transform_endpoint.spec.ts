import { transformEndpoint, isValidEndpointFormat } from './transform_endpoint';

describe('transform_endpoint', () => {
  describe('transformEndpoint', () => {
    describe('Basic Transformations', () => {
      it('should transform comma-separated endpoint to slash-separated path', () => {
        const endpoint = 'ABL101,v1,iso20022,pain.001';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/ABL101/v1/iso20022/pain.001');
      });

      it('should add leading slash to transformed endpoint', () => {
        const endpoint = 'api,v2,payments';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api/v2/payments');
      });

      it('should handle single segment', () => {
        const endpoint = 'health';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/health');
      });

      it('should handle empty string', () => {
        const endpoint = '';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/');
      });

      it('should handle single comma', () => {
        const endpoint = ',';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('//');
      });
    });

    describe('Complex Endpoints', () => {
      it('should handle endpoints with many segments', () => {
        const endpoint = 'api,v1,microservice,gateway,evaluate,iso20022,pacs.008.001.10';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api/v1/microservice/gateway/evaluate/iso20022/pacs.008.001.10');
      });

      it('should handle endpoints with version numbers', () => {
        const endpoint = 'ABL101,v2.1,iso20022,pain.001.001.03';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/ABL101/v2.1/iso20022/pain.001.001.03');
      });

      it('should handle endpoints with special characters', () => {
        const endpoint = 'service-name,v1,endpoint_type,action@123';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/service-name/v1/endpoint_type/action@123');
      });

      it('should handle endpoints with numbers', () => {
        const endpoint = '123,456,789,000';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/123/456/789/000');
      });
    });

    describe('Whitespace Handling', () => {
      it('should trim whitespace from endpoints', () => {
        const endpoint = '  ABL101,v1,iso20022,pain.001  ';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/ABL101/v1/iso20022/pain.001');
      });

      it('should handle leading whitespace', () => {
        const endpoint = '   api,v1,payments';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api/v1/payments');
      });

      it('should handle trailing whitespace', () => {
        const endpoint = 'api,v1,payments   ';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api/v1/payments');
      });

      it('should handle whitespace-only string', () => {
        const endpoint = '   ';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/');
      });

      it('should preserve internal whitespace in segments', () => {
        const endpoint = 'api name,v1,payment type';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api name/v1/payment type');
      });
    });

    describe('Edge Cases', () => {
      it('should handle consecutive commas', () => {
        const endpoint = 'api,,v1,,payments';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api//v1//payments');
      });

      it('should handle leading comma', () => {
        const endpoint = ',api,v1,payments';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('//api/v1/payments');
      });

      it('should handle trailing comma', () => {
        const endpoint = 'api,v1,payments,';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api/v1/payments/');
      });

      it('should handle only commas', () => {
        const endpoint = ',,,';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('////');
      });

      it('should handle mixed separators (only commas should be replaced)', () => {
        const endpoint = 'api/v1,payments-service,endpoint_name';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api/v1/payments-service/endpoint_name');
      });
    });

    describe('Type Coercion', () => {
      it('should handle number input by converting to string', () => {
        const endpoint = 123456;
        const result = transformEndpoint(endpoint as any);
        expect(result).toBe('/123456');
      });

      it('should handle boolean input by converting to string', () => {
        const endpoint = true;
        const result = transformEndpoint(endpoint as any);
        expect(result).toBe('/true');
      });

      it('should handle object input by converting to string', () => {
        const endpoint = { toString: () => 'api,v1,custom' };
        const result = transformEndpoint(endpoint as any);
        expect(result).toBe('/api/v1/custom');
      });
    });

    describe('Unicode and Special Characters', () => {
      it('should handle unicode characters', () => {
        const endpoint = 'api,v1,тест,эндпоинт';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api/v1/тест/эндпоинт');
      });

      it('should handle emoji characters', () => {
        const endpoint = 'api,v1,payment💰,transfer🚀';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api/v1/payment💰/transfer🚀');
      });

      it('should handle URL-encoded characters', () => {
        const endpoint = 'api,v1,payment%20type,transfer';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api/v1/payment%20type/transfer');
      });

      it('should handle special punctuation', () => {
        const endpoint = 'api,v1,payment.type,transfer-service';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/api/v1/payment.type/transfer-service');
      });
    });

    describe('Real-world Examples', () => {
      it('should transform ABL101 endpoint', () => {
        const endpoint = 'ABL101,v1,iso20022,pacs.008.001.10';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/ABL101/v1/iso20022/pacs.008.001.10');
      });

      it('should transform payment initiation endpoint', () => {
        const endpoint = 'PAYMENT_SERVICE,v2,iso20022,pain.001.001.11';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/PAYMENT_SERVICE/v2/iso20022/pain.001.001.11');
      });

      it('should transform status report endpoint', () => {
        const endpoint = 'STATUS_SERVICE,v1,iso20022,pacs.002.001.12';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/STATUS_SERVICE/v1/iso20022/pacs.002.001.12');
      });

      it('should transform cancellation request endpoint', () => {
        const endpoint = 'CANCEL_SERVICE,v3,iso20022,camt.056.001.10';
        const result = transformEndpoint(endpoint);
        expect(result).toBe('/CANCEL_SERVICE/v3/iso20022/camt.056.001.10');
      });
    });

    describe('Performance', () => {
      it('should handle very long endpoints efficiently', () => {
        const longSegment = 'a'.repeat(1000);
        const endpoint = `${longSegment},v1,${longSegment},endpoint`;

        const startTime = Date.now();
        const result = transformEndpoint(endpoint);
        const endTime = Date.now();

        expect(result).toBe(`/${longSegment}/v1/${longSegment}/endpoint`);
        expect(endTime - startTime).toBeLessThan(10);
      });

      it('should handle many segments efficiently', () => {
        const segments = Array.from({ length: 1000 }, (_, i) => `segment${i}`);
        const endpoint = segments.join(',');

        const startTime = Date.now();
        const result = transformEndpoint(endpoint);
        const endTime = Date.now();

        expect(result).toBe('/' + segments.join('/'));
        expect(endTime - startTime).toBeLessThan(50);
      });

      it('should not mutate input', () => {
        const originalEndpoint = 'api,v1,payments';
        const endpoint = originalEndpoint;
        const result = transformEndpoint(endpoint);

        expect(endpoint).toBe(originalEndpoint);
        expect(result).toBe('/api/v1/payments');
      });
    });
  });

  describe('isValidEndpointFormat', () => {
    describe('Valid Formats', () => {
      it('should return true for simple comma-separated endpoint', () => {
        const endpoint = 'api,v1,payments';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return true for complex comma-separated endpoint', () => {
        const endpoint = 'ABL101,v1,iso20022,pacs.008.001.10';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return true for endpoint with single comma', () => {
        const endpoint = 'api,v1';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return true for endpoint with many segments', () => {
        const endpoint = 'a,b,c,d,e,f,g,h,i,j';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return true for endpoint with special characters', () => {
        const endpoint = 'service-name,v1.0,endpoint_type';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return true for endpoint with numbers', () => {
        const endpoint = '123,456,789';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return true for endpoint with unicode characters', () => {
        const endpoint = 'api,тест,эндпоинт';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return true for endpoint with emoji', () => {
        const endpoint = 'api,payment💰,transfer';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });
    });

    describe('Invalid Formats', () => {
      it('should return false for empty string', () => {
        const endpoint = '';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });

      it('should return false for string without commas', () => {
        const endpoint = 'api/v1/payments';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });

      it('should return false for single word without commas', () => {
        const endpoint = 'health';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });

      it('should return false for whitespace-only string', () => {
        const endpoint = '   ';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });

      it('should return false for number input', () => {
        const endpoint = 123;
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });

      it('should return false for boolean input', () => {
        const endpoint = true;
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });

      it('should return false for null input', () => {
        const endpoint = null;
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });

      it('should return false for undefined input', () => {
        const endpoint = undefined;
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });

      it('should return false for object input', () => {
        const endpoint = { toString: () => 'api,v1' };
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });

      it('should return false for array input', () => {
        const endpoint = ['api', 'v1', 'payments'];
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should return true for endpoint with only comma', () => {
        const endpoint = ',';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return true for endpoint with consecutive commas', () => {
        const endpoint = 'api,,v1,,payments';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return true for endpoint with leading comma', () => {
        const endpoint = ',api,v1';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return true for endpoint with trailing comma', () => {
        const endpoint = 'api,v1,';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return true for endpoint with only commas', () => {
        const endpoint = ',,,';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(true);
      });

      it('should return false for string with other separators only', () => {
        const endpoint = 'api/v1/payments';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });

      it('should return false for string with dots only', () => {
        const endpoint = 'api.v1.payments';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });

      it('should return false for string with hyphens only', () => {
        const endpoint = 'api-v1-payments';
        const result = isValidEndpointFormat(endpoint);
        expect(result).toBe(false);
      });
    });

    describe('Type Safety', () => {
      it('should act as type guard for string type', () => {
        const endpoint: unknown = 'api,v1,payments';

        if (isValidEndpointFormat(endpoint)) {
          expect(typeof endpoint).toBe('string');
          expect(endpoint.includes(',')).toBe(true);
        }
      });

      it('should correctly identify non-string types', () => {
        const inputs: unknown[] = [123, true, null, undefined, {}, []];

        inputs.forEach((input) => {
          const result = isValidEndpointFormat(input);
          expect(result).toBe(false);
        });
      });
    });

    describe('Performance', () => {
      it('should validate long endpoints efficiently', () => {
        const longEndpoint = Array.from({ length: 1000 }, (_, i) => `segment${i}`).join(',');

        const startTime = Date.now();
        const result = isValidEndpointFormat(longEndpoint);
        const endTime = Date.now();

        expect(result).toBe(true);
        expect(endTime - startTime).toBeLessThan(10);
      });

      it('should validate many different inputs efficiently', () => {
        const inputs = ['valid,endpoint', 'invalid endpoint', 123, null, undefined, 'another,valid,endpoint', 'invalid.endpoint'];

        const startTime = Date.now();
        inputs.forEach((input) => isValidEndpointFormat(input));
        const endTime = Date.now();

        expect(endTime - startTime).toBeLessThan(10);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should work together - validate then transform', () => {
      const endpoint = 'ABL101,v1,iso20022,pacs.008.001.10';

      if (isValidEndpointFormat(endpoint)) {
        const transformed = transformEndpoint(endpoint);
        expect(transformed).toBe('/ABL101/v1/iso20022/pacs.008.001.10');
      } else {
        fail('Endpoint should be valid');
      }
    });

    it('should handle invalid endpoint gracefully', () => {
      const endpoint = 'invalid/endpoint/format';

      if (isValidEndpointFormat(endpoint)) {
        fail('Endpoint should be invalid');
      } else {
        const transformed = transformEndpoint(endpoint);
        expect(transformed).toBe('/invalid/endpoint/format');
      }
    });

    it('should handle edge case workflow', () => {
      const endpoints = ['valid,endpoint', 'invalid endpoint', '', ',', 'a,b,c,d,e'];

      endpoints.forEach((endpoint) => {
        const isValid = isValidEndpointFormat(endpoint);
        const transformed = transformEndpoint(endpoint);

        if (isValid) {
          expect(endpoint.includes(',')).toBe(true);
          expect(transformed.includes('/')).toBe(true);
        }

        expect(transformed.startsWith('/')).toBe(true);
      });
    });
  });
});
