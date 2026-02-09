-- Add status_text column to separate user-entered status from notes/creative direction
ALTER TABLE projects ADD COLUMN status_text TEXT DEFAULT '';

-- Migrate: copy non-JSON notes content to status_text
-- (notes that aren't JSON scope data were being used as status text)
