-- Migration 0005: Add Password Protection to Share Links
-- Allows optional password protection on share links

ALTER TABLE share_links ADD COLUMN password_hash TEXT DEFAULT NULL;

-- NULL password_hash = no password required (existing behavior)
-- Non-NULL password_hash = requires password to access
