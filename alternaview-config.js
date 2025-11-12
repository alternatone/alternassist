// Configuration for Alternaview
const path = require('path');
const os = require('os');

module.exports = {
  // Server settings
  port: 3000,

  // Storage paths - use external drive FTP1 for media files
  storagePath: '/Volumes/FTP1',

  // Database - place in app directory
  dbPath: path.join(__dirname, 'alternaview.db'),

  // Session settings
  sessionSecret: 'alternaview-secret-change-in-production', // TODO: Change this in production
  sessionMaxAge: 24 * 60 * 60 * 1000, // 24 hours

  // File upload settings
  maxFileSize: 64 * 1024 * 1024 * 1024 // 64GB
};
