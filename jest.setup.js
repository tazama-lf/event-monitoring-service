const path = require('path');

// Load test environment variables from .env.test file
require('dotenv').config({
  path: path.resolve(process.cwd(), '.env.test'),
});

// Ensure NODE_ENV is set to test (this should already be set in .env.test but ensuring it here)
process.env.NODE_ENV = 'test';

// Mock the startup library to prevent import-time crashes in CI
jest.mock('@tazama-lf/frms-coe-startup-lib');
