#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load config
const config = require('../../alternaview-config.js');

// FTP source and backup paths
const FTP_SOURCE = config.storagePath;
const FTP_BACKUP = config.storagePath.replace('/FTP', '/FTP BACKUP');

console.log('===== FTP Backup Script =====');
console.log(`Source: ${FTP_SOURCE}`);
console.log(`Destination: ${FTP_BACKUP}`);
console.log('');

// Check if source exists
if (!fs.existsSync(FTP_SOURCE)) {
  console.error(`ERROR: Source directory does not exist: ${FTP_SOURCE}`);
  console.error('Please ensure the FTP drive is mounted.');
  process.exit(1);
}

// Check if backup destination exists, create if not
if (!fs.existsSync(FTP_BACKUP)) {
  console.log(`Creating backup directory: ${FTP_BACKUP}`);
  try {
    fs.mkdirSync(FTP_BACKUP, { recursive: true });
  } catch (error) {
    console.error(`ERROR: Failed to create backup directory: ${error.message}`);
    process.exit(1);
  }
}

// Use rsync for efficient backup (carbon copy)
// -a: archive mode (preserves permissions, timestamps, etc.)
// -v: verbose
// --delete: delete files in destination that don't exist in source
// --progress: show progress

try {
  console.log('Starting backup...');
  console.log('');

  const rsyncCommand = `rsync -av --delete --progress "${FTP_SOURCE}/" "${FTP_BACKUP}/"`;

  execSync(rsyncCommand, {
    stdio: 'inherit',
    maxBuffer: 1024 * 1024 * 10 // 10MB buffer
  });

  console.log('');
  console.log('✓ Backup completed successfully!');
  console.log('');

} catch (error) {
  console.error('');
  console.error(`ERROR: Backup failed: ${error.message}`);
  console.error('');
  process.exit(1);
}
