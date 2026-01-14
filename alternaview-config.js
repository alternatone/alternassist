// Configuration for Alternaview
const path = require('path');
const os = require('os');
const fs = require('fs');

// Try to get Electron app - will fail gracefully if running in plain Node
let electronApp = null;
try {
  electronApp = require('electron').app;
} catch (e) {
  // Not running in Electron
}

// Determine the correct base path for the app
// In packaged apps, __dirname points inside the asar archive, so we need to use app.getAppPath()
// For the database, we want it in a writable location (user data directory)
function getAppBasePath() {
  try {
    // Check if we're in a packaged Electron app
    if (electronApp && electronApp.isPackaged) {
      return path.dirname(electronApp.getAppPath());
    }
  } catch (e) {
    // app not available (running in plain Node)
  }
  return __dirname;
}

function getDataPath() {
  try {
    // In packaged apps, store data in user data directory for write access
    if (electronApp && electronApp.isPackaged) {
      return electronApp.getPath('userData');
    }
  } catch (e) {
    // app not available
  }
  return __dirname;
}

const appBasePath = getAppBasePath();
const dataPath = getDataPath();

// Try to load custom config from user settings
let customConfig = {};
const customConfigPath = path.join(dataPath, 'alternaview-custom-config.json');
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
const legacyStoragePath = path.join(appBasePath, 'ftp-storage');

module.exports = {
  // Server settings
  port: 3000,

  // Storage paths - configurable via environment variable, custom config file, or defaults to FTP drive
  storagePath: defaultStoragePath,
  legacyStoragePath: legacyStoragePath,

  // Database - use data path for write access in packaged apps
  dbPath: path.join(dataPath, 'alternaview.db'),

  // Session settings
  sessionSecret: 'alternaview-secret-change-in-production', // TODO: Change this in production
  sessionMaxAge: 24 * 60 * 60 * 1000, // 24 hours

  // File upload settings
  maxFileSize: 64 * 1024 * 1024 * 1024 // 64GB
};
