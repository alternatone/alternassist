#!/usr/bin/env node

/**
 * Alternassist Standalone Server
 *
 * This runs the Express server without Electron for background deployment.
 * To run manually: node server-standalone.js
 * To install as service: see install-service.sh
 */

const alternaviewServer = require('./alternaview-server');
const { initDatabase } = require('./server/models/database');

console.log('='.repeat(60));
console.log('Alternassist Standalone Server');
console.log('='.repeat(60));

// Initialize database
try {
  initDatabase();
  console.log('✓ Database initialized');
} catch (error) {
  console.error('✗ Database initialization failed:', error);
  process.exit(1);
}

// Start the Express server
try {
  alternaviewServer.startServer();
  console.log('✓ Server started successfully');
  console.log('Server running at: http://localhost:3000');
  console.log('Public URL: https://alternassist.alternatone.com');
  console.log('='.repeat(60));
} catch (error) {
  console.error('✗ Failed to start server:', error);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  alternaviewServer.stopServer();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  alternaviewServer.stopServer();
  process.exit(0);
});

// Keep process alive
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - keep server running
});
