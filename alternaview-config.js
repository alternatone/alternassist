// Configuration for Alternaview
const path = require('path');
const os = require('os');
const fs = require('fs');

// Try to load custom config from user settings
let customConfig = {};
const customConfigPath = path.join(__dirname, 'alternaview-custom-config.json');
if (fs.existsSync(customConfigPath)) {
  try {
    customConfig = JSON.parse(fs.readFileSync(customConfigPath, 'utf8'));
  } catch (error) {
    console.error('Error loading custom config:', error);
  }
}

// Default storage path - use local folder in development, or custom path in production
const defaultStoragePath = process.env.ALTERNAVIEW_STORAGE_PATH ||
  customConfig.storagePath ||
  path.join(__dirname, 'ftp-storage');

module.exports = {
  // Server settings
  port: 3000,

  // Storage paths - configurable via environment variable, custom config file, or defaults to local folder
  storagePath: defaultStoragePath,

  // Database - place in app directory
  dbPath: path.join(__dirname, 'alternaview.db'),

  // Session settings
  sessionSecret: 'alternaview-secret-change-in-production', // TODO: Change this in production
  sessionMaxAge: 24 * 60 * 60 * 1000, // 24 hours

  // File upload settings
  maxFileSize: 64 * 1024 * 1024 * 1024 // 64GB
};
