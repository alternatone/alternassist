#!/usr/bin/env node

/**
 * Kanban Projects Migration Script
 * Migrates projects from localStorage format to SQLite database
 *
 * Usage: node run-migration.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Sample Kanban projects data (localStorage format)
// You can modify this array with actual data or load from a JSON file
const sampleKanbanProjects = [
  {
    id: '1',
    name: 'Sample Project Alpha',
    clientName: 'Acme Corporation',
    status: 'active',
    notes: 'This is a sample active project with client details',
    pinned: true
  },
  {
    id: '2',
    name: 'Sample Project Beta',
    clientName: 'Beta Industries',
    status: 'prospects',
    notes: 'Potential new client project',
    pinned: false
  },
  {
    id: '3',
    name: 'Sample Project Gamma',
    clientName: 'Gamma LLC',
    status: 'hold',
    notes: 'On hold pending client approval',
    pinned: false
  },
  {
    id: '4',
    name: 'Sample Project Delta',
    clientName: 'Delta Co',
    status: 'completed',
    notes: 'Successfully completed project',
    pinned: true
  }
];

// Database configuration
const dbPath = path.join(__dirname, 'alternaview.db');
const storagePath = '/Volumes/FTP1';

console.log('=================================');
console.log('Kanban Projects Migration Script');
console.log('=================================\n');

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.error('❌ Error: Database not found at', dbPath);
  console.log('Please ensure the Electron app has been started at least once to initialize the database.');
  process.exit(1);
}

// Open database
const db = new Database(dbPath);

// Prepare queries
const checkProjectQuery = db.prepare('SELECT id, name FROM projects WHERE name = ?');
const insertProjectQuery = db.prepare(`
  INSERT INTO projects (
    name,
    password,
    client_name,
    status,
    notes,
    pinned,
    media_folder_path,
    password_protected,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

// Migration stats
let total = 0;
let migrated = 0;
let skipped = 0;
let errors = 0;

console.log(`Found ${sampleKanbanProjects.length} projects to migrate\n`);

// Migrate each project
for (const project of sampleKanbanProjects) {
  total++;

  try {
    // Check if project already exists
    const existing = checkProjectQuery.get(project.name);

    if (existing) {
      console.log(`⚠️  Skipping "${project.name}" - already exists (ID: ${existing.id})`);
      skipped++;
      continue;
    }

    // Create project directory
    const projectPath = path.join(storagePath, project.name);
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // Insert into database
    // Note: Using placeholder password due to NOT NULL constraint in existing databases
    const result = insertProjectQuery.run(
      project.name,
      'migrated', // temporary password (not used since password_protected is false)
      project.clientName || null,
      project.status || 'prospects',
      project.notes || null,
      project.pinned ? 1 : 0,
      null, // media_folder_path
      0 // password_protected (so the password won't be checked)
    );

    console.log(`✅ Migrated "${project.name}" (ID: ${result.lastInsertRowid}, Status: ${project.status || 'prospects'})`);
    migrated++;

  } catch (error) {
    console.log(`❌ Error migrating "${project.name}": ${error.message}`);
    errors++;
  }
}

// Close database
db.close();

// Summary
console.log('\n=================================');
console.log('Migration Summary');
console.log('=================================');
console.log(`Total projects:       ${total}`);
console.log(`Successfully migrated: ${migrated}`);
console.log(`Skipped (duplicates): ${skipped}`);
console.log(`Errors:               ${errors}`);
console.log('=================================\n');

if (migrated > 0) {
  console.log('✨ Migration completed successfully!');
  console.log('The Kanban board will now load projects from SQLite.\n');
} else if (skipped > 0 && errors === 0) {
  console.log('ℹ️  All projects already exist in the database.');
} else if (errors > 0) {
  console.log('⚠️  Migration completed with some errors.');
  process.exit(1);
}
