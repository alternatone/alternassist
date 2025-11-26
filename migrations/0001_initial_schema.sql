-- Alternassist Database Schema
-- Migration: 0001_initial_schema.sql
-- Created for Cloudflare D1

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================================
-- PROJECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  password TEXT,
  password_plaintext TEXT,
  client_name TEXT,
  contact_email TEXT,
  status TEXT DEFAULT 'prospects',
  notes TEXT,
  pinned INTEGER DEFAULT 0,
  media_folder_path TEXT,
  password_protected INTEGER DEFAULT 0,
  trt TEXT,
  music_coverage INTEGER DEFAULT 0,
  timeline_start TEXT,
  timeline_end TEXT,
  estimated_total REAL DEFAULT 0,
  estimated_taxes REAL DEFAULT 0,
  net_after_taxes REAL DEFAULT 0,
  file_count INTEGER DEFAULT 0,
  total_size INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  archived_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- FILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  transcoded_file_path TEXT,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  duration TEXT,
  folder TEXT DEFAULT 'TO AA',
  transcoding_status TEXT DEFAULT 'pending',
  transcoding_error TEXT,
  transcoding_attempts INTEGER DEFAULT 0,
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================================================
-- SHARE LINKS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS share_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  file_id INTEGER,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- ============================================================================
-- COMMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  timecode TEXT,
  comment_text TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  billable INTEGER DEFAULT 0,
  billed_in_invoice_id INTEGER,
  estimated_hours REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- ============================================================================
-- INVOICE DELIVERABLES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_deliverables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  UNIQUE(invoice_id, file_id)
);

-- ============================================================================
-- ACCESS LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  file_id INTEGER,
  action TEXT NOT NULL,
  ip_address TEXT,
  accessed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL
);

-- ============================================================================
-- PROJECT SCOPE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_scope (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL UNIQUE,
  contact_email TEXT,
  music_minutes INTEGER DEFAULT 0,
  dialogue_hours REAL DEFAULT 0,
  sound_design_hours REAL DEFAULT 0,
  mix_hours REAL DEFAULT 0,
  revision_hours REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================================================
-- ESTIMATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  runtime TEXT,
  music_minutes INTEGER DEFAULT 0,
  dialogue_hours REAL DEFAULT 0,
  sound_design_hours REAL DEFAULT 0,
  mix_hours REAL DEFAULT 0,
  revision_hours REAL DEFAULT 0,
  post_days REAL DEFAULT 0,
  bundle_discount INTEGER DEFAULT 0,
  music_cost REAL DEFAULT 0,
  post_cost REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================================================
-- CUES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS cues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  cue_number TEXT NOT NULL,
  title TEXT,
  status TEXT DEFAULT 'to-write',
  duration TEXT,
  notes TEXT,
  start_time TEXT,
  end_time TEXT,
  theme TEXT,
  version TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================================================
-- INVOICES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  invoice_number TEXT UNIQUE,
  amount REAL,
  deposit_amount REAL,
  deposit_percentage REAL,
  final_amount REAL,
  status TEXT DEFAULT 'draft',
  due_date TEXT,
  issue_date TEXT,
  line_items TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER,
  project_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  payment_date TEXT,
  payment_method TEXT,
  payment_type TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================================================
-- ACCOUNTING RECORDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS accounting_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  transaction_type TEXT NOT NULL,
  category TEXT,
  amount REAL NOT NULL,
  transaction_date TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- ============================================================================
-- HOURS LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS hours_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  hours REAL NOT NULL,
  category TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_file ON comments(file_id);
CREATE INDEX IF NOT EXISTS idx_estimates_project ON estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_project ON payments(project_id);
CREATE INDEX IF NOT EXISTS idx_cues_project ON cues(project_id);
CREATE INDEX IF NOT EXISTS idx_hours_project ON hours_log(project_id);
CREATE INDEX IF NOT EXISTS idx_accounting_project ON accounting_records(project_id);
CREATE INDEX IF NOT EXISTS idx_share_links_project ON share_links(project_id);
CREATE INDEX IF NOT EXISTS idx_share_links_file ON share_links(file_id);
CREATE INDEX IF NOT EXISTS idx_scope_project ON project_scope(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_invoice ON invoice_deliverables(invoice_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_file ON invoice_deliverables(file_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Update project stats on file insert
DROP TRIGGER IF EXISTS update_project_stats_on_file_insert;
CREATE TRIGGER update_project_stats_on_file_insert
AFTER INSERT ON files
BEGIN
  UPDATE projects
  SET file_count = file_count + 1,
      total_size = total_size + NEW.file_size,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.project_id;
END;

-- Trigger: Update project stats on file delete
DROP TRIGGER IF EXISTS update_project_stats_on_file_delete;
CREATE TRIGGER update_project_stats_on_file_delete
AFTER DELETE ON files
BEGIN
  UPDATE projects
  SET file_count = file_count - 1,
      total_size = total_size - OLD.file_size,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.project_id;
END;

-- Trigger: Update project stats on file size update
DROP TRIGGER IF EXISTS update_project_stats_on_file_update;
CREATE TRIGGER update_project_stats_on_file_update
AFTER UPDATE OF file_size ON files
BEGIN
  UPDATE projects
  SET total_size = total_size - OLD.file_size + NEW.file_size,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.project_id;
END;
