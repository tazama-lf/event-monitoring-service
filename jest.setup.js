// Load environment variables from .env file for testing
require('dotenv').config();

// Override specific environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME || 'test_db';

// Ensure required environment variables have defaults if not set
process.env.STARTUP_TYPE = process.env.STARTUP_TYPE || 'nats';
process.env.SERVER_URL = process.env.SERVER_URL || 'nats://localhost:4222';
process.env.PRODUCER_STREAM = process.env.PRODUCER_STREAM || 'producer-stream';
process.env.CONSUMER_STREAM = process.env.CONSUMER_STREAM || 'consumer-stream';
process.env.FUNCTION_NAME = process.env.FUNCTION_NAME || 'event-monitoring-service';
process.env.REDIS_DB = process.env.REDIS_DB || '0';
process.env.REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'password';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_USER = process.env.DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'password';
process.env.DB_PORT = process.env.DB_PORT || '5432';
