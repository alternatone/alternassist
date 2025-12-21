-- Migration 0007: Create Share Links Table
-- Allows generating shareable links for projects with optional password protection and expiry

CREATE TABLE IF NOT EXISTS share_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    project_id INTEGER NOT NULL,
    expires_at INTEGER DEFAULT NULL,  -- NULL = never expires, otherwise Unix timestamp
    password_hash TEXT DEFAULT NULL,  -- NULL = no password required, otherwise bcrypt hash
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by INTEGER,  -- admin user who created the link
    access_count INTEGER NOT NULL DEFAULT 0,  -- Track how many times link was accessed
    last_accessed_at INTEGER DEFAULT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_share_links_token ON share_links(token);
CREATE INDEX idx_share_links_project_id ON share_links(project_id);
CREATE INDEX idx_share_links_expires_at ON share_links(expires_at);
