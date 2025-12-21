const Database = require('better-sqlite3');
const path = require('path');
const config = require('../../alternaview-config');

// Initialize database - use a path relative to the app directory
const dbPath = config.dbPath || path.join(__dirname, '../../alternaview.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
function initDatabase() {
  // Projects table (extended with Kanban fields)
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      password TEXT,
      client_name TEXT,
      status TEXT DEFAULT 'prospects',
      notes TEXT,
      pinned BOOLEAN DEFAULT 0,
      media_folder_path TEXT,
      password_protected BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Files table
  db.exec(`
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
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add folder column if it doesn't exist
  const tableInfo = db.prepare("PRAGMA table_info(files)").all();
  const hasFolderColumn = tableInfo.some(col => col.name === 'folder');
  if (!hasFolderColumn) {
    db.exec(`ALTER TABLE files ADD COLUMN folder TEXT DEFAULT 'TO AA'`);
  }

  // Share Links table
  db.exec(`
    CREATE TABLE IF NOT EXISTS share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      file_id INTEGER,
      token TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add transcoded_file_path column if it doesn't exist
  const fileColumns = db.prepare("PRAGMA table_info(files)").all();
  const hasTranscodedPath = fileColumns.some(col => col.name === 'transcoded_file_path');
  if (!hasTranscodedPath) {
    db.exec('ALTER TABLE files ADD COLUMN transcoded_file_path TEXT');
    console.log('Added transcoded_file_path column to files table');
  }

  // Migration: Add Kanban fields to projects table if they don't exist
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all();
  const kanbanFields = ['client_name', 'status', 'notes', 'pinned', 'media_folder_path', 'password_protected'];

  kanbanFields.forEach(field => {
    const hasField = projectColumns.some(col => col.name === field);
    if (!hasField) {
      let fieldType = 'TEXT';
      let fieldDefault = '';

      if (field === 'pinned' || field === 'password_protected') {
        fieldType = 'BOOLEAN';
        fieldDefault = ' DEFAULT 0';
      } else if (field === 'status') {
        fieldDefault = " DEFAULT 'prospects'";
      }

      db.exec(`ALTER TABLE projects ADD COLUMN ${field} ${fieldType}${fieldDefault}`);
      console.log(`Added ${field} column to projects table`);
    }
  });

  // Migration: Add new project fields for comprehensive data flow
  const newProjectFields = [
    { name: 'contact_email', type: 'TEXT', default: '' },
    { name: 'trt', type: 'TEXT', default: '' },
    { name: 'music_coverage', type: 'INTEGER', default: ' DEFAULT 0' },
    { name: 'timeline_start', type: 'DATE', default: '' },
    { name: 'timeline_end', type: 'DATE', default: '' },
    { name: 'estimated_total', type: 'REAL', default: ' DEFAULT 0' },
    { name: 'estimated_taxes', type: 'REAL', default: ' DEFAULT 0' },
    { name: 'net_after_taxes', type: 'REAL', default: ' DEFAULT 0' }
  ];

  newProjectFields.forEach(field => {
    const hasField = projectColumns.some(col => col.name === field.name);
    if (!hasField) {
      db.exec(`ALTER TABLE projects ADD COLUMN ${field.name} ${field.type}${field.default}`);
      console.log(`Added ${field.name} column to projects table`);
    }
  });

  // Migration: Make password nullable in projects table (existing constraint can't be changed, so we note it)
  const passwordColumn = projectColumns.find(col => col.name === 'password');
  if (passwordColumn && passwordColumn.notnull === 1) {
    console.log('Note: password column is still NOT NULL in existing databases. New projects can have NULL passwords.');
  }

  // Migration: Add password_plaintext column for admin viewing
  const hasPasswordPlaintext = projectColumns.some(col => col.name === 'password_plaintext');
  if (!hasPasswordPlaintext) {
    db.exec('ALTER TABLE projects ADD COLUMN password_plaintext TEXT');
    console.log('Added password_plaintext column to projects table');
  }

  // PHASE 2: Performance - Add denormalized stats columns
  const hasFileCount = projectColumns.some(col => col.name === 'file_count');
  if (!hasFileCount) {
    db.exec('ALTER TABLE projects ADD COLUMN file_count INTEGER DEFAULT 0');
    console.log('Added file_count column to projects table');
  }

  const hasTotalSize = projectColumns.some(col => col.name === 'total_size');
  if (!hasTotalSize) {
    db.exec('ALTER TABLE projects ADD COLUMN total_size INTEGER DEFAULT 0');
    console.log('Added total_size column to projects table');
  }

  // PHASE 3: Data Integrity - Add archived flag for soft delete
  const hasArchived = projectColumns.some(col => col.name === 'archived');
  if (!hasArchived) {
    db.exec('ALTER TABLE projects ADD COLUMN archived BOOLEAN DEFAULT 0');
    console.log('Added archived column to projects table');
  }

  const hasArchivedAt = projectColumns.some(col => col.name === 'archived_at');
  if (!hasArchivedAt) {
    db.exec('ALTER TABLE projects ADD COLUMN archived_at DATETIME');
    console.log('Added archived_at column to projects table');
  }

  // PHASE 4: FTP Storage Integration - Add folder_path column
  const hasFolderPath = projectColumns.some(col => col.name === 'folder_path');
  if (!hasFolderPath) {
    db.exec("ALTER TABLE projects ADD COLUMN folder_path TEXT NOT NULL DEFAULT ''");
    console.log('Added folder_path column to projects table');

    // Migrate existing projects: set folder_path = sanitized name
    const projects = db.prepare("SELECT id, name FROM projects WHERE folder_path IS NULL OR folder_path = ''").all();
    const updateFolderPath = db.prepare('UPDATE projects SET folder_path = ? WHERE id = ?');

    projects.forEach(project => {
      const sanitizedName = project.name.replace(/[^a-zA-Z0-9-_]/g, '_');
      updateFolderPath.run(sanitizedName, project.id);
    });

    if (projects.length > 0) {
      console.log(`Migrated folder_path for ${projects.length} existing projects`);
    }

    // Create unique index on folder_path
    try {
      db.exec('CREATE UNIQUE INDEX idx_folder_path ON projects(folder_path)');
      console.log('Created unique index on folder_path');
    } catch (e) {
      // Index may already exist
      if (!e.message.includes('already exists')) {
        console.error('Error creating folder_path index:', e.message);
      }
    }
  }

  // PHASE 3: Add transcoding status tracking to files
  const hasTranscodingStatus = fileColumns.some(col => col.name === 'transcoding_status');
  if (!hasTranscodingStatus) {
    db.exec("ALTER TABLE files ADD COLUMN transcoding_status TEXT DEFAULT 'pending'");
    console.log('Added transcoding_status column to files table');
  }

  const hasTranscodingError = fileColumns.some(col => col.name === 'transcoding_error');
  if (!hasTranscodingError) {
    db.exec('ALTER TABLE files ADD COLUMN transcoding_error TEXT');
    console.log('Added transcoding_error column to files table');
  }

  const hasTranscodingAttempts = fileColumns.some(col => col.name === 'transcoding_attempts');
  if (!hasTranscodingAttempts) {
    db.exec('ALTER TABLE files ADD COLUMN transcoding_attempts INTEGER DEFAULT 0');
    console.log('Added transcoding_attempts column to files table');
  }

  const hasFilesUpdatedAt = fileColumns.some(col => col.name === 'updated_at');
  if (!hasFilesUpdatedAt) {
    db.exec('ALTER TABLE files ADD COLUMN updated_at DATETIME');
    db.exec('UPDATE files SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL');
    console.log('Added updated_at column to files table');
  }


  // Comments table (for future use)
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      timecode TEXT,
      comment_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    )
  `);

  // PHASE 3: Add billing linkage to comments
  const commentColumns = db.prepare("PRAGMA table_info(comments)").all();

  const hasStatus = commentColumns.some(col => col.name === 'status');
  if (!hasStatus) {
    db.exec("ALTER TABLE comments ADD COLUMN status TEXT DEFAULT 'open'");
    console.log('Added status column to comments table');
  }

  const hasBillable = commentColumns.some(col => col.name === 'billable');
  if (!hasBillable) {
    db.exec('ALTER TABLE comments ADD COLUMN billable BOOLEAN DEFAULT 0');
    console.log('Added billable column to comments table');
  }

  const hasBilledInInvoiceId = commentColumns.some(col => col.name === 'billed_in_invoice_id');
  if (!hasBilledInInvoiceId) {
    db.exec('ALTER TABLE comments ADD COLUMN billed_in_invoice_id INTEGER');
    console.log('Added billed_in_invoice_id column to comments table');
  }

  const hasEstimatedHours = commentColumns.some(col => col.name === 'estimated_hours');
  if (!hasEstimatedHours) {
    db.exec('ALTER TABLE comments ADD COLUMN estimated_hours REAL');
    console.log('Added estimated_hours column to comments table');
  }

  const hasUpdatedAt = commentColumns.some(col => col.name === 'updated_at');
  if (!hasUpdatedAt) {
    db.exec('ALTER TABLE comments ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    console.log('Added updated_at column to comments table');
  }

  // PHASE 3: Create invoice_deliverables junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_deliverables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      file_id INTEGER NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      UNIQUE(invoice_id, file_id)
    )
  `);

  // Create indexes for invoice_deliverables
  db.exec('CREATE INDEX IF NOT EXISTS idx_deliverables_invoice ON invoice_deliverables(invoice_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_deliverables_file ON invoice_deliverables(file_id)');

  // Access logs (optional, for tracking downloads/views)
  db.exec(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      file_id INTEGER,
      action TEXT NOT NULL,
      ip_address TEXT,
      accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL
    )
  `);

  // Project scope table (replaces JSON in notes field)
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_scope (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL UNIQUE,
      contact_email TEXT,
      music_minutes INTEGER DEFAULT 0,
      dialogue_hours REAL DEFAULT 0,
      sound_design_hours REAL DEFAULT 0,
      mix_hours REAL DEFAULT 0,
      revision_hours REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Estimates table (replaces localStorage 'logged-estimates')
  db.exec(`
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
      bundle_discount BOOLEAN DEFAULT 0,
      music_cost REAL DEFAULT 0,
      post_cost REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Cues table (replaces localStorage 'cue-tracker-cues')
  db.exec(`
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Add new columns to existing cues table if they don't exist
  try {
    db.exec(`ALTER TABLE cues ADD COLUMN start_time TEXT`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE cues ADD COLUMN end_time TEXT`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE cues ADD COLUMN theme TEXT`);
  } catch (e) { /* Column already exists */ }
  try {
    db.exec(`ALTER TABLE cues ADD COLUMN version TEXT`);
  } catch (e) { /* Column already exists */ }

  // Invoices table (replaces localStorage invoice data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      invoice_number TEXT UNIQUE,
      amount REAL,
      deposit_amount REAL,
      deposit_percentage REAL,
      final_amount REAL,
      status TEXT DEFAULT 'draft',
      due_date DATE,
      issue_date DATE,
      line_items TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Payments table (replaces localStorage payment tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER,
      project_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date DATE,
      payment_method TEXT,
      payment_type TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Accounting records table (replaces localStorage accounting data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounting_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      transaction_type TEXT NOT NULL,
      category TEXT,
      amount REAL NOT NULL,
      transaction_date DATE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    )
  `);

  // Hours log table (time tracking for projects)
  db.exec(`
    CREATE TABLE IF NOT EXISTS hours_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      date DATE NOT NULL,
      hours REAL NOT NULL,
      category TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for foreign keys (10-100x performance improvement)
  db.exec(`
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
  `);

  // PHASE 2: Create triggers for automatic stats updates
  db.exec(`
    -- Trigger on file insert
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

    -- Trigger on file delete
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

    -- Trigger on file size update
    DROP TRIGGER IF EXISTS update_project_stats_on_file_update;
    CREATE TRIGGER update_project_stats_on_file_update
    AFTER UPDATE OF file_size ON files
    BEGIN
      UPDATE projects
      SET total_size = total_size - OLD.file_size + NEW.file_size,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.project_id;
    END;
  `);

  // PHASE 2: Backfill existing project stats
  if (hasFileCount || hasTotalSize) {
    const backfillStats = db.prepare(`
      UPDATE projects
      SET file_count = (
        SELECT COUNT(*) FROM files WHERE files.project_id = projects.id
      ),
      total_size = (
        SELECT COALESCE(SUM(file_size), 0) FROM files WHERE files.project_id = projects.id
      )
      WHERE file_count = 0 OR total_size = 0
    `);
    const result = backfillStats.run();
    if (result.changes > 0) {
      console.log(`Backfilled stats for ${result.changes} projects`);
    }
  }

  console.log('Database initialized successfully with performance indexes and triggers');
}

// Initialize database tables immediately
initDatabase();

// Project queries
const projectQueries = {
  create: db.prepare(`
    INSERT INTO projects (
      name, password, client_name, contact_email, status, notes, pinned,
      media_folder_path, password_protected, trt, music_coverage,
      timeline_start, timeline_end, estimated_total, estimated_taxes, net_after_taxes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  createWithPlaintext: db.prepare(`
    INSERT INTO projects (
      name, password, password_plaintext, client_name, contact_email, status, notes, pinned,
      media_folder_path, password_protected, trt, music_coverage,
      timeline_start, timeline_end, estimated_total, estimated_taxes, net_after_taxes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  createSimple: db.prepare('INSERT INTO projects (name, password) VALUES (?, ?)'),
  findByName: db.prepare('SELECT * FROM projects WHERE name = ?'),
  findById: db.prepare('SELECT * FROM projects WHERE id = ?'),
  getAll: db.prepare('SELECT * FROM projects WHERE (archived IS NULL OR archived = 0) ORDER BY updated_at DESC'),
  getAllWithStats: db.prepare(`
    SELECT
      p.*,
      COUNT(f.id) as file_count,
      COALESCE(SUM(f.file_size), 0) as total_size
    FROM projects p
    LEFT JOIN files f ON p.id = f.project_id
    WHERE (p.archived IS NULL OR p.archived = 0)
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `),
  getWithStats: db.prepare(`
    SELECT
      p.*,
      COALESCE(COUNT(f.id), 0) as file_count,
      COALESCE(SUM(f.file_size), 0) as total_size
    FROM projects p
    LEFT JOIN files f ON f.project_id = p.id
    WHERE p.id = ?
    GROUP BY p.id
  `),
  getAllWithMusicScope: db.prepare(`
    SELECT
      p.id,
      p.name,
      p.client_name,
      COALESCE(p.music_coverage, ps.music_minutes, 0) as music_minutes
    FROM projects p
    LEFT JOIN project_scope ps ON ps.project_id = p.id
    WHERE (p.archived IS NULL OR p.archived = 0)
      AND COALESCE(p.music_coverage, ps.music_minutes, 0) > 0
    ORDER BY p.updated_at DESC
  `),
  getAllWithScope: db.prepare(`
    SELECT
      p.id,
      p.name,
      p.client_name,
      p.status,
      p.notes,
      p.pinned,
      p.music_coverage,
      p.updated_at,
      ps.contact_email,
      ps.music_minutes,
      ps.dialogue_hours,
      ps.sound_design_hours,
      ps.mix_hours,
      ps.revision_hours
    FROM projects p
    LEFT JOIN project_scope ps ON ps.project_id = p.id
    WHERE (p.archived IS NULL OR p.archived = 0)
    ORDER BY p.updated_at DESC
  `),
  getKanbanData: db.prepare(`
    SELECT
      p.id,
      p.name,
      p.client_name,
      p.status,
      p.notes,
      p.pinned,
      ps.contact_email,
      ps.music_minutes,
      ps.dialogue_hours,
      ps.sound_design_hours,
      ps.mix_hours,
      ps.revision_hours,
      (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND status = 'to-write') as cues_to_write,
      (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND status = 'written') as cues_written,
      (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND status = 'revisions') as cues_revisions,
      (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND (status = 'approved' OR status = 'complete')) as cues_approved,
      (SELECT COALESCE(SUM(hours), 0) FROM hours_log WHERE project_id = p.id AND category = 'dialogue') as logged_dialogue,
      (SELECT COALESCE(SUM(hours), 0) FROM hours_log WHERE project_id = p.id AND category = 'sound-design') as logged_sound_design,
      (SELECT COALESCE(SUM(hours), 0) FROM hours_log WHERE project_id = p.id AND category = 'mix') as logged_mix,
      (SELECT COALESCE(SUM(hours), 0) FROM hours_log WHERE project_id = p.id AND category = 'revisions') as logged_revisions
    FROM projects p
    LEFT JOIN project_scope ps ON ps.project_id = p.id
    WHERE p.id = ?
  `),
  update: db.prepare(`
    UPDATE projects
    SET name = ?, client_name = ?, contact_email = ?, status = ?, notes = ?, pinned = ?,
        media_folder_path = ?, password_protected = ?, password = ?, trt = ?,
        music_coverage = ?, timeline_start = ?, timeline_end = ?,
        estimated_total = ?, estimated_taxes = ?, net_after_taxes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  updateMediaFolder: db.prepare('UPDATE projects SET media_folder_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  updatePasswordProtection: db.prepare('UPDATE projects SET password_protected = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  updatePassword: db.prepare('UPDATE projects SET password = ?, password_plaintext = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  delete: db.prepare('DELETE FROM projects WHERE id = ?'),
  // PHASE 3: Soft delete methods
  archive: db.prepare('UPDATE projects SET archived = 1, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  unarchive: db.prepare('UPDATE projects SET archived = 0, archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  getArchived: db.prepare('SELECT * FROM projects WHERE archived = 1 ORDER BY archived_at DESC'),
  updateTimestamp: db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
};

// File queries
const fileQueries = {
  create: db.prepare(`
    INSERT INTO files (project_id, filename, original_name, file_path, file_size, mime_type, duration, transcoded_file_path, folder)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  findById: db.prepare('SELECT * FROM files WHERE id = ?'),
  findByProject: db.prepare('SELECT * FROM files WHERE project_id = ? ORDER BY folder, uploaded_at DESC'),
  findByProjectAndFolder: db.prepare('SELECT * FROM files WHERE project_id = ? AND folder = ? ORDER BY uploaded_at DESC'),
  delete: db.prepare('DELETE FROM files WHERE id = ?'),
  updateTranscodedPath: db.prepare('UPDATE files SET transcoded_file_path = ? WHERE id = ?'),
  getStats: db.prepare(`
    SELECT
      COUNT(*) as file_count,
      SUM(file_size) as total_size
    FROM files
    WHERE project_id = ?
  `),
  // PHASE 3: Transcoding status management
  updateTranscodingStatus: db.prepare('UPDATE files SET transcoding_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  updateTranscodingError: db.prepare('UPDATE files SET transcoding_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  updateTranscodingAttempts: db.prepare('UPDATE files SET transcoding_attempts = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  updateTranscodingComplete: db.prepare(`
    UPDATE files
    SET transcoded_file_path = ?,
        duration = ?,
        transcoding_status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  findByTranscodingStatus: db.prepare('SELECT * FROM files WHERE transcoding_status = ? ORDER BY uploaded_at DESC')
};

// Comment queries
const commentQueries = {
  create: db.prepare('INSERT INTO comments (file_id, author_name, timecode, comment_text) VALUES (?, ?, ?, ?)'),
  findByFile: db.prepare('SELECT * FROM comments WHERE file_id = ? ORDER BY created_at ASC'),
  findById: db.prepare('SELECT * FROM comments WHERE id = ?'),
  updateStatus: db.prepare('UPDATE comments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  delete: db.prepare('DELETE FROM comments WHERE id = ?'),
  // PHASE 3: Billable comments management
  updateBillable: db.prepare('UPDATE comments SET billable = ?, estimated_hours = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  linkToInvoice: db.prepare('UPDATE comments SET billed_in_invoice_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  getBillableByProject: db.prepare(`
    SELECT c.*, f.original_name as file_name, f.project_id
    FROM comments c
    JOIN files f ON f.id = c.file_id
    WHERE f.project_id = ?
      AND c.billable = 1
      AND c.billed_in_invoice_id IS NULL
    ORDER BY c.created_at DESC
  `)
};

// Access log queries
const logQueries = {
  create: db.prepare('INSERT INTO access_logs (project_id, file_id, action, ip_address) VALUES (?, ?, ?, ?)'),
  getRecentByProject: db.prepare('SELECT * FROM access_logs WHERE project_id = ? ORDER BY accessed_at DESC LIMIT ?'),
  getRecentByFile: db.prepare('SELECT * FROM access_logs WHERE file_id = ? ORDER BY accessed_at DESC LIMIT ?')
};

// Share link queries
const shareLinkQueries = {
  create: db.prepare('INSERT INTO share_links (project_id, file_id, token) VALUES (?, ?, ?)'),
  findByToken: db.prepare('SELECT * FROM share_links WHERE token = ?'),
  findByProject: db.prepare('SELECT * FROM share_links WHERE project_id = ? AND file_id IS NULL'),
  findByFile: db.prepare('SELECT * FROM share_links WHERE file_id = ?'),
  delete: db.prepare('DELETE FROM share_links WHERE id = ?'),
  deleteByProject: db.prepare('DELETE FROM share_links WHERE project_id = ?')
};

// Project scope queries
const scopeQueries = {
  create: db.prepare(`
    INSERT INTO project_scope (project_id, contact_email, music_minutes, dialogue_hours, sound_design_hours, mix_hours, revision_hours)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  findByProject: db.prepare('SELECT * FROM project_scope WHERE project_id = ?'),
  update: db.prepare(`
    UPDATE project_scope
    SET contact_email = ?, music_minutes = ?, dialogue_hours = ?, sound_design_hours = ?, mix_hours = ?, revision_hours = ?, updated_at = CURRENT_TIMESTAMP
    WHERE project_id = ?
  `),
  upsert: db.prepare(`
    INSERT INTO project_scope (project_id, contact_email, music_minutes, dialogue_hours, sound_design_hours, mix_hours, revision_hours)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      contact_email = excluded.contact_email,
      music_minutes = excluded.music_minutes,
      dialogue_hours = excluded.dialogue_hours,
      sound_design_hours = excluded.sound_design_hours,
      mix_hours = excluded.mix_hours,
      revision_hours = excluded.revision_hours,
      updated_at = CURRENT_TIMESTAMP
  `),
  delete: db.prepare('DELETE FROM project_scope WHERE project_id = ?')
};

// Estimate queries
const estimateQueries = {
  create: db.prepare(`
    INSERT INTO estimates (project_id, runtime, music_minutes, dialogue_hours, sound_design_hours, mix_hours, revision_hours, post_days, bundle_discount, music_cost, post_cost, discount_amount, total_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  findById: db.prepare('SELECT * FROM estimates WHERE id = ?'),
  findByProject: db.prepare('SELECT * FROM estimates WHERE project_id = ? ORDER BY created_at DESC'),
  getAll: db.prepare('SELECT * FROM estimates ORDER BY created_at DESC'),
  getAllWithProjects: db.prepare(`
    SELECT
      e.*,
      p.name as project_name,
      p.client_name,
      p.contact_email
    FROM estimates e
    LEFT JOIN projects p ON p.id = e.project_id
    ORDER BY e.created_at DESC
    LIMIT ?
  `),
  getWithProject: db.prepare(`
    SELECT
      e.*,
      p.name as project_name,
      p.client_name,
      p.contact_email
    FROM estimates e
    LEFT JOIN projects p ON p.id = e.project_id
    WHERE e.id = ?
  `),
  delete: db.prepare('DELETE FROM estimates WHERE id = ?')
};

// Cue queries
const cueQueries = {
  create: db.prepare('INSERT INTO cues (project_id, cue_number, title, status, duration, notes, start_time, end_time, theme, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  findById: db.prepare('SELECT * FROM cues WHERE id = ?'),
  findByProject: db.prepare('SELECT * FROM cues WHERE project_id = ? ORDER BY cue_number'),
  getAll: db.prepare('SELECT * FROM cues ORDER BY project_id, cue_number'),
  update: db.prepare('UPDATE cues SET cue_number = ?, title = ?, status = ?, duration = ?, notes = ?, start_time = ?, end_time = ?, theme = ?, version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  delete: db.prepare('DELETE FROM cues WHERE id = ?'),
  deleteByProject: db.prepare('DELETE FROM cues WHERE project_id = ?'),
  getCueStatsByProject: db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'to-write' THEN 1 END) as to_write,
      COUNT(CASE WHEN status = 'written' THEN 1 END) as written,
      COUNT(CASE WHEN status = 'revisions' THEN 1 END) as revisions,
      COUNT(CASE WHEN status = 'approved' OR status = 'complete' THEN 1 END) as approved,
      COALESCE(SUM(CASE
        WHEN (status = 'approved' OR status = 'complete') AND start_time IS NOT NULL AND end_time IS NOT NULL
        THEN (
          (CAST(SUBSTR(end_time, 1, 2) AS INTEGER) * 3600 +
           CAST(SUBSTR(end_time, 4, 2) AS INTEGER) * 60 +
           CAST(SUBSTR(end_time, 7, 2) AS INTEGER)) -
          (CAST(SUBSTR(start_time, 1, 2) AS INTEGER) * 3600 +
           CAST(SUBSTR(start_time, 4, 2) AS INTEGER) * 60 +
           CAST(SUBSTR(start_time, 7, 2) AS INTEGER))
        ) / 60.0
        ELSE 0
      END), 0) as approved_minutes
    FROM cues
    WHERE project_id = ?
  `)
};

// Invoice queries
const invoiceQueries = {
  create: db.prepare(`
    INSERT INTO invoices (project_id, invoice_number, amount, deposit_amount, deposit_percentage, final_amount, status, due_date, issue_date, line_items)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  findById: db.prepare('SELECT * FROM invoices WHERE id = ?'),
  getWithPayments: db.prepare(`
    SELECT i.*,
      COALESCE(
        JSON_GROUP_ARRAY(
          CASE WHEN p.id IS NOT NULL THEN
            JSON_OBJECT(
              'id', p.id,
              'amount', p.amount,
              'payment_date', p.payment_date,
              'payment_method', p.payment_method,
              'payment_type', p.payment_type,
              'notes', p.notes,
              'created_at', p.created_at
            )
          END
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) as payments_json
    FROM invoices i
    LEFT JOIN payments p ON p.invoice_id = i.id
    WHERE i.id = ?
    GROUP BY i.id
  `),
  getAllWithProjects: db.prepare(`
    SELECT
      i.*,
      p.name as project_name,
      p.client_name
    FROM invoices i
    LEFT JOIN projects p ON p.id = i.project_id
    ORDER BY i.created_at DESC
    LIMIT ?
  `),
  getNextInvoiceNumber: db.prepare(`
    SELECT MAX(CAST(SUBSTR(invoice_number, 3) AS INTEGER)) as max_num
    FROM invoices
    WHERE invoice_number LIKE '25%'
      AND LENGTH(invoice_number) >= 4
  `),
  getWithProject: db.prepare(`
    SELECT
      i.*,
      p.name as project_name,
      p.client_name,
      COALESCE(
        JSON_GROUP_ARRAY(
          CASE WHEN pm.id IS NOT NULL THEN
            JSON_OBJECT(
              'id', pm.id,
              'amount', pm.amount,
              'payment_date', pm.payment_date,
              'payment_method', pm.payment_method,
              'payment_type', pm.payment_type,
              'notes', pm.notes
            )
          END
        ) FILTER (WHERE pm.id IS NOT NULL),
        '[]'
      ) as payments_json
    FROM invoices i
    LEFT JOIN projects p ON p.id = i.project_id
    LEFT JOIN payments pm ON pm.invoice_id = i.id
    WHERE i.id = ?
    GROUP BY i.id
  `),
  findByProject: db.prepare('SELECT * FROM invoices WHERE project_id = ? ORDER BY created_at DESC'),
  getAll: db.prepare('SELECT * FROM invoices ORDER BY created_at DESC'),
  update: db.prepare(`
    UPDATE invoices
    SET invoice_number = ?, amount = ?, deposit_amount = ?, deposit_percentage = ?, final_amount = ?, status = ?, due_date = ?, issue_date = ?, line_items = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  updateStatus: db.prepare(`
    UPDATE invoices
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  delete: db.prepare('DELETE FROM invoices WHERE id = ?')
};

// Payment queries
const paymentQueries = {
  create: db.prepare('INSERT INTO payments (invoice_id, project_id, amount, payment_date, payment_method, payment_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  findById: db.prepare('SELECT * FROM payments WHERE id = ?'),
  findByInvoice: db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC'),
  findByProject: db.prepare('SELECT * FROM payments WHERE project_id = ? ORDER BY payment_date DESC'),
  getAll: db.prepare('SELECT * FROM payments ORDER BY payment_date DESC'),
  delete: db.prepare('DELETE FROM payments WHERE id = ?'),
  getAllWithProjects: db.prepare(`
    SELECT
      p.id,
      p.invoice_id,
      p.project_id,
      p.amount,
      p.payment_date,
      p.payment_method,
      p.payment_type,
      p.notes,
      pr.name as project_name
    FROM payments p
    LEFT JOIN projects pr ON pr.id = p.project_id
    ORDER BY p.payment_date DESC
  `)
};

// PHASE 3: Invoice deliverables queries
const deliverableQueries = {
  create: db.prepare(`
    INSERT INTO invoice_deliverables (invoice_id, file_id, description)
    VALUES (?, ?, ?)
  `),
  findByInvoice: db.prepare(`
    SELECT d.*, f.original_name, f.file_size, f.mime_type, f.folder
    FROM invoice_deliverables d
    JOIN files f ON f.id = d.file_id
    WHERE d.invoice_id = ?
    ORDER BY d.created_at DESC
  `),
  findByFile: db.prepare(`
    SELECT d.*, i.invoice_number, i.amount, i.status
    FROM invoice_deliverables d
    JOIN invoices i ON i.id = d.invoice_id
    WHERE d.file_id = ?
    ORDER BY d.created_at DESC
  `),
  getUnbilledFiles: db.prepare(`
    SELECT f.*
    FROM files f
    WHERE f.project_id = ?
      AND f.folder = 'FROM AA'
      AND f.id NOT IN (SELECT file_id FROM invoice_deliverables)
    ORDER BY f.uploaded_at DESC
  `),
  delete: db.prepare('DELETE FROM invoice_deliverables WHERE id = ?')
};

// Accounting queries
const accountingQueries = {
  create: db.prepare('INSERT INTO accounting_records (project_id, transaction_type, category, amount, transaction_date, description) VALUES (?, ?, ?, ?, ?, ?)'),
  findById: db.prepare('SELECT * FROM accounting_records WHERE id = ?'),
  findByProject: db.prepare('SELECT * FROM accounting_records WHERE project_id = ? ORDER BY transaction_date DESC'),
  getAll: db.prepare('SELECT * FROM accounting_records ORDER BY transaction_date DESC'),
  delete: db.prepare('DELETE FROM accounting_records WHERE id = ?')
};

// Hours log queries
const hoursLogQueries = {
  create: db.prepare('INSERT INTO hours_log (project_id, date, hours, category, description) VALUES (?, ?, ?, ?, ?)'),
  findById: db.prepare('SELECT * FROM hours_log WHERE id = ?'),
  findByProject: db.prepare('SELECT * FROM hours_log WHERE project_id = ? ORDER BY date DESC'),
  getAll: db.prepare('SELECT * FROM hours_log ORDER BY date DESC'),
  update: db.prepare('UPDATE hours_log SET date = ?, hours = ?, category = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  delete: db.prepare('DELETE FROM hours_log WHERE id = ?'),
  getTotalByProject: db.prepare(`
    SELECT
      category,
      SUM(hours) as total_hours
    FROM hours_log
    WHERE project_id = ?
    GROUP BY category
  `),
  getProjectTotal: db.prepare(`
    SELECT SUM(hours) as total_hours
    FROM hours_log
    WHERE project_id = ?
  `)
};

// Download token queries
const downloadTokenQueries = {
  create: db.prepare('INSERT INTO download_tokens (token, file_path, expires_at) VALUES (?, ?, ?)'),
  findByToken: db.prepare('SELECT * FROM download_tokens WHERE token = ?'),
  incrementDownloadCount: db.prepare('UPDATE download_tokens SET download_count = download_count + 1 WHERE token = ?'),
  deleteExpired: db.prepare('DELETE FROM download_tokens WHERE expires_at < unixepoch()'),
  delete: db.prepare('DELETE FROM download_tokens WHERE token = ?')
};

module.exports = {
  db,
  initDatabase,
  projectQueries,
  fileQueries,
  commentQueries,
  logQueries,
  shareLinkQueries,
  scopeQueries,
  estimateQueries,
  cueQueries,
  invoiceQueries,
  paymentQueries,
  deliverableQueries,
  accountingQueries,
  hoursLogQueries,
  downloadTokenQueries
};
