// Mock environment variables before any imports
process.env.STARTUP_TYPE = 'nats';
process.env.SERVER_URL = 'nats://localhost:4222';
process.env.PRODUCER_STREAM = 'producer-stream';
process.env.CONSUMER_STREAM = 'consumer-stream';
process.env.FUNCTION_NAME = 'event-monitoring-service';
process.env.NODE_ENV = 'test';
process.env.REDIS_DB = '0';
process.env.REDIS_AUTH = 'password';
process.env.REDIS_SERVERS = 'localhost:6379';
process.env.REDIS_IS_CLUSTER = 'false';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'password';
process.env.DB_NAME = 'test_db';
process.env.DB_PORT = '5432';
