#!/usr/bin/env node
/**
 * Migration Script: Move files from local ftp-storage/ to external FTP drive
 *
 * This script:
 * 1. Checks if FTP drive is mounted at /Volumes/FTP1
 * 2. For each project in the database:
 *    - Creates folder structure on FTP drive using folder_path
 *    - Copies all files from local storage to FTP drive
 *    - Updates file_path in files table
 *    - Verifies file integrity
 * 3. Creates a backup log of all operations
 *
 * Usage: node server/scripts/migrate-to-ftp.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { db, projectQueries, fileQueries } = require('../models/database');
const config = require('../../alternaview-config');

// Command line arguments
const isDryRun = process.argv.includes('--dry-run');

// Paths
const FTP_DRIVE = '/Volumes/FTP1';
const LEGACY_STORAGE = path.join(__dirname, '../../ftp-storage');
const LOG_FILE = path.join(__dirname, `migration-log-${Date.now()}.txt`);

// Logging
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

function logError(message, error) {
  const errorMessage = `ERROR: ${message}`;
  if (error) {
    console.error(errorMessage, error);
    fs.appendFileSync(LOG_FILE, `${errorMessage}: ${error.message}\n`);
  } else {
    console.error(errorMessage);
    fs.appendFileSync(LOG_FILE, errorMessage + '\n');
  }
}

// Helper to copy file with verification
function copyFileWithVerification(source, destination) {
  // Ensure destination directory exists
  const destDir = path.dirname(destination);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Copy file
  fs.copyFileSync(source, destination);

  // Verify file size matches
  const sourceStats = fs.statSync(source);
  const destStats = fs.statSync(destination);

  if (sourceStats.size !== destStats.size) {
    throw new Error(`File size mismatch: ${source} (${sourceStats.size}) vs ${destination} (${destStats.size})`);
  }

  return true;
}

// Main migration function
async function migrateToFTP() {
  log('=== Starting FTP Migration ===');
  log(`Dry run mode: ${isDryRun}`);
  log(`FTP Drive: ${FTP_DRIVE}`);
  log(`Legacy Storage: ${LEGACY_STORAGE}`);
  log('');

  // Step 1: Check FTP drive is mounted
  log('Step 1: Checking FTP drive availability...');
  if (!fs.existsSync(FTP_DRIVE)) {
    logError('FTP drive not mounted. Please connect the external drive at /Volumes/FTP1 and try again.');
    process.exit(1);
  }
  log('✓ FTP drive is available');
  log('');

  // Step 2: Check legacy storage exists
  log('Step 2: Checking legacy storage...');
  if (!fs.existsSync(LEGACY_STORAGE)) {
    log('Legacy storage directory does not exist. Nothing to migrate.');
    log('✓ Migration complete (no files to migrate)');
    return;
  }
  log(`✓ Legacy storage found at ${LEGACY_STORAGE}`);
  log('');

  // Step 3: Get all projects from database
  log('Step 3: Loading projects from database...');
  const projects = db.prepare('SELECT id, name, folder_path FROM projects').all();
  log(`✓ Found ${projects.length} projects`);
  log('');

  // Step 4: Migrate each project
  let totalFilesCopied = 0;
  let totalBytesCopied = 0;
  const errors = [];

  for (const project of projects) {
    log(`--- Migrating Project: ${project.name} (ID: ${project.id}) ---`);

    const folderPath = project.folder_path || project.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const legacyPath = path.join(LEGACY_STORAGE, project.name);
    const ftpPath = path.join(FTP_DRIVE, folderPath);

    log(`  Legacy path: ${legacyPath}`);
    log(`  FTP path: ${ftpPath}`);

    // Check if legacy folder exists
    if (!fs.existsSync(legacyPath)) {
      log(`  ⚠ No legacy folder found - skipping`);
      log('');
      continue;
    }

    // Create FTP folder structure
    if (!isDryRun) {
      try {
        fs.mkdirSync(path.join(ftpPath, 'TO AA'), { recursive: true });
        fs.mkdirSync(path.join(ftpPath, 'FROM AA'), { recursive: true });
        log(`  ✓ Created FTP folder structure`);
      } catch (error) {
        logError(`  Failed to create FTP folders for ${project.name}`, error);
        errors.push({ project: project.name, error: error.message });
        continue;
      }
    } else {
      log(`  [DRY RUN] Would create: ${ftpPath}/TO AA, ${ftpPath}/FROM AA`);
    }

    // Get all files for this project from database
    const files = fileQueries.findByProject.all(project.id);
    log(`  Found ${files.length} files in database for this project`);

    let projectFilesCopied = 0;
    let projectBytesCopied = 0;

    for (const file of files) {
      const oldPath = file.file_path;

      // Skip if file doesn't exist in legacy storage
      if (!fs.existsSync(oldPath)) {
        log(`  ⚠ File not found in legacy storage: ${oldPath}`);
        continue;
      }

      // Determine folder (TO AA or FROM AA)
      const folder = file.folder || 'TO AA';
      const fileName = path.basename(oldPath);
      const newPath = path.join(ftpPath, folder, fileName);

      try {
        if (!isDryRun) {
          // Copy file with verification
          copyFileWithVerification(oldPath, newPath);

          // Update database with new path
          db.prepare('UPDATE files SET file_path = ? WHERE id = ?').run(newPath, file.id);

          // Handle transcoded file if it exists
          if (file.transcoded_file_path && fs.existsSync(file.transcoded_file_path)) {
            const transcodedFileName = path.basename(file.transcoded_file_path);
            const newTranscodedPath = path.join(ftpPath, folder, transcodedFileName);

            copyFileWithVerification(file.transcoded_file_path, newTranscodedPath);
            db.prepare('UPDATE files SET transcoded_file_path = ? WHERE id = ?').run(newTranscodedPath, file.id);
          }

          projectFilesCopied++;
          projectBytesCopied += file.file_size;
          log(`  ✓ Migrated: ${fileName} (${(file.file_size / 1024 / 1024).toFixed(2)} MB)`);
        } else {
          log(`  [DRY RUN] Would copy: ${oldPath} → ${newPath}`);
          projectFilesCopied++;
          projectBytesCopied += file.file_size;
        }
      } catch (error) {
        logError(`  Failed to migrate file: ${fileName}`, error);
        errors.push({
          project: project.name,
          file: fileName,
          error: error.message
        });
      }
    }

    totalFilesCopied += projectFilesCopied;
    totalBytesCopied += projectBytesCopied;

    log(`  Summary: ${projectFilesCopied} files, ${(projectBytesCopied / 1024 / 1024 / 1024).toFixed(2)} GB`);
    log('');
  }

  // Step 5: Summary
  log('=== Migration Summary ===');
  log(`Total projects processed: ${projects.length}`);
  log(`Total files copied: ${totalFilesCopied}`);
  log(`Total data copied: ${(totalBytesCopied / 1024 / 1024 / 1024).toFixed(2)} GB`);
  log(`Errors encountered: ${errors.length}`);

  if (errors.length > 0) {
    log('');
    log('=== Errors ===');
    errors.forEach(err => {
      log(`  Project: ${err.project}, File: ${err.file || 'N/A'}, Error: ${err.error}`);
    });
  }

  log('');
  if (isDryRun) {
    log('✓ Dry run complete. No files were actually moved.');
    log('  To perform the actual migration, run: node server/scripts/migrate-to-ftp.js');
  } else {
    log('✓ Migration complete!');
    log('');
    log('Next steps:');
    log('  1. Verify files are accessible in the app');
    log('  2. Test upload/download/streaming functionality');
    log('  3. After confirming everything works, you can safely delete the legacy ftp-storage/ folder');
    log(`  4. Migration log saved to: ${LOG_FILE}`);
  }
}

// Run migration
migrateToFTP()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logError('Migration failed', error);
    process.exit(1);
  });
