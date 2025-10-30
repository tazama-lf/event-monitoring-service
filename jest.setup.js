const path = require('path');

// Load test environment variables from .env.test file
require('dotenv').config({
  path: path.resolve(process.cwd(), '.env'),
});

// Ensure NODE_ENV is set to test (this should already be set in .env.test but ensuring it here)
process.env.NODE_ENV = 'test';
