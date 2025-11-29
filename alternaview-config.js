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

// FTP storage path - external SSD mounted at /Volumes/FTP1
const ftpStoragePath = '/Volumes/FTP1';

// Default storage path - use FTP drive, or custom path via environment variable
const defaultStoragePath = process.env.ALTERNAVIEW_STORAGE_PATH ||
  customConfig.storagePath ||
  ftpStoragePath;

// Legacy storage path - old local folder (for migration reference only)
const legacyStoragePath = path.join(__dirname, 'ftp-storage');

module.exports = {
  // Server settings
  port: 3000,

  // Storage paths - configurable via environment variable, custom config file, or defaults to FTP drive
  storagePath: defaultStoragePath,
  legacyStoragePath: legacyStoragePath,

  // Database - place in app directory
  dbPath: path.join(__dirname, 'alternaview.db'),

  // Session settings
  sessionSecret: 'alternaview-secret-change-in-production', // TODO: Change this in production
  sessionMaxAge: 24 * 60 * 60 * 1000, // 24 hours

  // File upload settings
  maxFileSize: 64 * 1024 * 1024 * 1024 // 64GB
};
