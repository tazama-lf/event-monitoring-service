import { config } from 'dotenv';
config();

/**
 * Database configuration utility that can be used by both Knex CLI and the application
 */
export const getDatabaseConfig = () => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'event_monitoring_dev',
});
