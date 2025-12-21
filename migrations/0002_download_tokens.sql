-- Download Tokens Table for Public File Sharing
CREATE TABLE IF NOT EXISTS download_tokens (
    token TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    download_count INTEGER NOT NULL DEFAULT 0
);

-- Index for expiry cleanup
CREATE INDEX IF NOT EXISTS idx_download_tokens_expires_at ON download_tokens(expires_at);

-- Index for file path lookups
CREATE INDEX IF NOT EXISTS idx_download_tokens_file_path ON download_tokens(file_path);
