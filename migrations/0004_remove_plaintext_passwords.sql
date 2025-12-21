-- Migration 0004: Remove Plaintext Password Storage
-- Removes the password_plaintext column for security

-- SQLite doesn't support DROP COLUMN in older versions, so we recreate the table
-- Create new projects table without password_plaintext
CREATE TABLE projects_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    client_name TEXT,
    status TEXT DEFAULT 'prospects',
    notes TEXT,
    pinned BOOLEAN DEFAULT 0,
    media_folder_path TEXT,
    password_protected BOOLEAN DEFAULT 0,
    contact_email TEXT,
    trt TEXT,
    music_coverage INTEGER DEFAULT 0,
    timeline_start DATE,
    timeline_end DATE,
    estimated_total REAL DEFAULT 0,
    estimated_taxes REAL DEFAULT 0,
    net_after_taxes REAL DEFAULT 0,
    file_count INTEGER DEFAULT 0,
    total_size INTEGER DEFAULT 0,
    archived BOOLEAN DEFAULT 0,
    archived_at DATETIME,
    folder_path TEXT NOT NULL DEFAULT ''
);

-- Copy data from old table (excluding password_plaintext)
INSERT INTO projects_new
SELECT
    id, name, password, created_at, updated_at, client_name, status, notes,
    pinned, media_folder_path, password_protected, contact_email, trt,
    music_coverage, timeline_start, timeline_end, estimated_total,
    estimated_taxes, net_after_taxes, file_count, total_size, archived,
    archived_at, folder_path
FROM projects;

-- Drop old table
DROP TABLE projects;

-- Rename new table
ALTER TABLE projects_new RENAME TO projects;

-- Recreate indexes if any existed
-- (based on the audit, there should be some indexes but we'll create common ones)
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived);
