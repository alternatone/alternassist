#!/usr/bin/env node

// Standalone web server entry point (no Electron required)
// Usage: node server.js
// Or:    npm run start:web

const { startServer } = require('./alternaview-server');
startServer();
