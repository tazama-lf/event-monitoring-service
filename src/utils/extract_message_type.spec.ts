import { extractTransactionType } from './extract_message_type';

describe('extractTransactionType', () => {
  describe('Valid URL Paths', () => {
    it('should extract transaction type from standard URL path', () => {
      const url = '/v1/evaluate/iso20022/pacs.008.001.10';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs.008.001.10');
    });

    it('should extract transaction type from URL with multiple segments', () => {
      const url = '/api/v2/transactions/iso20022/pain.001.001.03';
      const result = extractTransactionType(url);
      expect(result).toBe('pain.001.001.03');
    });

    it('should extract transaction type from simple path', () => {
      const url = '/pacs.002.001.10';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs.002.001.10');
    });

    it('should extract transaction type from single segment', () => {
      const url = 'pain.008.001.02';
      const result = extractTransactionType(url);
      expect(result).toBe('pain.008.001.02');
    });

    it('should handle URL with query parameters', () => {
      const url = '/v1/evaluate/iso20022/pacs.008.001.10?param=value';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs.008.001.10?param=value');
    });

    it('should handle URL with fragments', () => {
      const url = '/v1/evaluate/iso20022/pacs.008.001.10#section';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs.008.001.10#section');
    });

    it('should handle URL with both query and fragments', () => {
      const url = '/v1/evaluate/iso20022/pacs.008.001.10?param=value#section';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs.008.001.10?param=value#section');
    });
  });

  describe('Edge Cases', () => {
    it('should return "unknown" for empty string', () => {
      const url = '';
      const result = extractTransactionType(url);
      expect(result).toBe('unknown');
    });

    it('should return "unknown" for single slash', () => {
      const url = '/';
      const result = extractTransactionType(url);
      expect(result).toBe('unknown');
    });

    it('should return "unknown" for multiple trailing slashes', () => {
      const url = '/v1/evaluate/iso20022/';
      const result = extractTransactionType(url);
      expect(result).toBe('unknown');
    });

    it('should return "unknown" for URL ending with multiple slashes', () => {
      const url = '/v1/evaluate/iso20022///';
      const result = extractTransactionType(url);
      expect(result).toBe('unknown');
    });

    it('should handle whitespace-only last segment', () => {
      const url = '/v1/evaluate/iso20022/   ';
      const result = extractTransactionType(url);
      expect(result).toBe('   ');
    });

    it('should handle URL with encoded characters', () => {
      const url = '/v1/evaluate/iso20022/pacs%2E008%2E001%2E10';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs%2E008%2E001%2E10');
    });
  });

  describe('Special Characters and Formats', () => {
    it('should handle transaction types with hyphens', () => {
      const url = '/v1/evaluate/iso20022/pain-001-001-03';
      const result = extractTransactionType(url);
      expect(result).toBe('pain-001-001-03');
    });

    it('should handle transaction types with underscores', () => {
      const url = '/v1/evaluate/iso20022/pacs_008_001_10';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs_008_001_10');
    });

    it('should handle alphanumeric transaction types', () => {
      const url = '/v1/evaluate/iso20022/tx123type456';
      const result = extractTransactionType(url);
      expect(result).toBe('tx123type456');
    });

    it('should handle special characters in transaction type', () => {
      const url = '/v1/evaluate/iso20022/type@123$456';
      const result = extractTransactionType(url);
      expect(result).toBe('type@123$456');
    });

    it('should handle unicode characters in transaction type', () => {
      const url = '/v1/evaluate/iso20022/тип-транзакции';
      const result = extractTransactionType(url);
      expect(result).toBe('тип-транзакции');
    });

    it('should handle emoji in transaction type', () => {
      const url = '/v1/evaluate/iso20022/payment💰type';
      const result = extractTransactionType(url);
      expect(result).toBe('payment💰type');
    });
  });

  describe('Real-world ISO20022 Message Types', () => {
    it('should extract pacs.008.001.10 (FIToFICustomerCreditTransfer)', () => {
      const url = '/v1/evaluate/iso20022/pacs.008.001.10';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs.008.001.10');
    });

    it('should extract pain.001.001.11 (CustomerCreditTransferInitiation)', () => {
      const url = '/v1/evaluate/iso20022/pain.001.001.11';
      const result = extractTransactionType(url);
      expect(result).toBe('pain.001.001.11');
    });

    it('should extract pacs.002.001.12 (FIToFIPaymentStatusReport)', () => {
      const url = '/v1/evaluate/iso20022/pacs.002.001.12';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs.002.001.12');
    });

    it('should extract camt.056.001.10 (FIToFICancellationRequest)', () => {
      const url = '/v1/evaluate/iso20022/camt.056.001.10';
      const result = extractTransactionType(url);
      expect(result).toBe('camt.056.001.10');
    });

    it('should extract pain.013.001.09 (CreditorPaymentActivationRequest)', () => {
      const url = '/v1/evaluate/iso20022/pain.013.001.09';
      const result = extractTransactionType(url);
      expect(result).toBe('pain.013.001.09');
    });
  });

  describe('Different URL Patterns', () => {
    it('should handle URLs without leading slash', () => {
      const url = 'api/v1/evaluate/pacs.008.001.10';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs.008.001.10');
    });

    it('should handle deeply nested URLs', () => {
      const url = '/api/v1/microservice/gateway/evaluate/iso20022/message/type/pacs.008.001.10';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs.008.001.10');
    });

    it('should handle URLs with version in transaction type', () => {
      const url = '/v1/evaluate/iso20022/pacs.008.001.10.v2';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs.008.001.10.v2');
    });

    it('should handle URLs with file extensions', () => {
      const url = '/v1/evaluate/iso20022/pacs.008.001.10.xml';
      const result = extractTransactionType(url);
      expect(result).toBe('pacs.008.001.10.xml');
    });
  });

  describe('Performance and Memory', () => {
    it('should handle very long URLs efficiently', () => {
      const longPath = '/very/long/path/with/many/segments/'.repeat(100);
      const url = `${longPath}pacs.008.001.10`;

      const startTime = Date.now();
      const result = extractTransactionType(url);
      const endTime = Date.now();

      expect(result).toBe('pacs.008.001.10');
      expect(endTime - startTime).toBeLessThan(10);
    });

    it('should handle very long transaction types', () => {
      const longType = 'a'.repeat(10000);
      const url = `/v1/evaluate/iso20022/${longType}`;
      const result = extractTransactionType(url);
      expect(result).toBe(longType);
    });

    it('should not mutate the input URL', () => {
      const originalUrl = '/v1/evaluate/iso20022/pacs.008.001.10';
      const url = originalUrl;
      const result = extractTransactionType(url);

      expect(url).toBe(originalUrl);
      expect(result).toBe('pacs.008.001.10');
    });
  });

  describe('Type Safety', () => {
    it('should handle string input types correctly', () => {
      const url: string = '/v1/evaluate/iso20022/pacs.008.001.10';
      const result = extractTransactionType(url);
      expect(typeof result).toBe('string');
      expect(result).toBe('pacs.008.001.10');
    });

    it('should return string type for unknown cases', () => {
      const url = '/';
      const result = extractTransactionType(url);
      expect(typeof result).toBe('string');
      expect(result).toBe('unknown');
    });
  });

  describe('Error Conditions', () => {
    it('should handle null-like values gracefully', () => {
      const url = '/v1/evaluate/iso20022/null';
      const result = extractTransactionType(url);
      expect(result).toBe('null');
    });

    it('should handle undefined-like values gracefully', () => {
      const url = '/v1/evaluate/iso20022/undefined';
      const result = extractTransactionType(url);
      expect(result).toBe('undefined');
    });
  });
});
