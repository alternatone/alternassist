-- Migration 0006: Allow NULL Expiry for Download Tokens
-- Enables permanent download links (no expiry)

-- SQLite doesn't support ALTER COLUMN, so we recreate the table
CREATE TABLE download_tokens_new (
    token TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    expires_at INTEGER DEFAULT NULL,  -- Changed to allow NULL for permanent links
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    download_count INTEGER NOT NULL DEFAULT 0
);

-- Copy existing data
INSERT INTO download_tokens_new
SELECT token, file_path, expires_at, created_at, download_count
FROM download_tokens;

-- Drop old table
DROP TABLE download_tokens;

-- Rename new table
ALTER TABLE download_tokens_new RENAME TO download_tokens;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_download_tokens_expires_at ON download_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_download_tokens_file_path ON download_tokens(file_path);
