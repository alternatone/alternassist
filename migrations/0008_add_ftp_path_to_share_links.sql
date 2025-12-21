-- Migration 0008: Add FTP Path Support to Share Links
-- Allows generating share links for standalone FTP files (not in files table)

ALTER TABLE share_links ADD COLUMN ftp_path TEXT DEFAULT NULL;

-- Now share links can have one of three targets:
-- 1. project_id NOT NULL, file_id NULL, ftp_path NULL = Share entire project
-- 2. project_id NULL, file_id NOT NULL, ftp_path NULL = Share specific database file
-- 3. project_id NULL, file_id NULL, ftp_path NOT NULL = Share FTP browser file

-- Constraint: At least one target must be specified
-- (enforced in application logic)
