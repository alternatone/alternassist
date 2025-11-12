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
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

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

  // Migration: Make password nullable in projects table (existing constraint can't be changed, so we note it)
  const passwordColumn = projectColumns.find(col => col.name === 'password');
  if (passwordColumn && passwordColumn.notnull === 1) {
    console.log('Note: password column is still NOT NULL in existing databases. New projects can have NULL passwords.');
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

  console.log('Database initialized successfully');
}

// Initialize database tables immediately
initDatabase();

// Project queries
const projectQueries = {
  create: db.prepare('INSERT INTO projects (name, password, client_name, status, notes, pinned, media_folder_path, password_protected) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  createSimple: db.prepare('INSERT INTO projects (name, password) VALUES (?, ?)'),
  findByName: db.prepare('SELECT * FROM projects WHERE name = ?'),
  findById: db.prepare('SELECT * FROM projects WHERE id = ?'),
  getAll: db.prepare('SELECT * FROM projects ORDER BY updated_at DESC'),
  getAllWithStats: db.prepare(`
    SELECT
      p.*,
      COUNT(f.id) as file_count,
      COALESCE(SUM(f.file_size), 0) as total_size
    FROM projects p
    LEFT JOIN files f ON p.id = f.project_id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `),
  update: db.prepare(`
    UPDATE projects
    SET name = ?, client_name = ?, status = ?, notes = ?, pinned = ?,
        media_folder_path = ?, password_protected = ?, password = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  updateMediaFolder: db.prepare('UPDATE projects SET media_folder_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  updatePasswordProtection: db.prepare('UPDATE projects SET password_protected = ?, password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  delete: db.prepare('DELETE FROM projects WHERE id = ?'),
  updateTimestamp: db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
};

// File queries
const fileQueries = {
  create: db.prepare(`
    INSERT INTO files (project_id, filename, original_name, file_path, file_size, mime_type, duration, transcoded_file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  findById: db.prepare('SELECT * FROM files WHERE id = ?'),
  findByProject: db.prepare('SELECT * FROM files WHERE project_id = ? ORDER BY uploaded_at DESC'),
  delete: db.prepare('DELETE FROM files WHERE id = ?'),
  updateTranscodedPath: db.prepare('UPDATE files SET transcoded_file_path = ? WHERE id = ?'),
  getStats: db.prepare(`
    SELECT
      COUNT(*) as file_count,
      SUM(file_size) as total_size
    FROM files
    WHERE project_id = ?
  `)
};

// Comment queries (for future)
const commentQueries = {
  create: db.prepare('INSERT INTO comments (file_id, author_name, timecode, comment_text) VALUES (?, ?, ?, ?)'),
  findByFile: db.prepare('SELECT * FROM comments WHERE file_id = ? ORDER BY created_at ASC'),
  delete: db.prepare('DELETE FROM comments WHERE id = ?')
};

// Access log queries
const logQueries = {
  create: db.prepare('INSERT INTO access_logs (project_id, file_id, action, ip_address) VALUES (?, ?, ?, ?)'),
  getRecentByProject: db.prepare('SELECT * FROM access_logs WHERE project_id = ? ORDER BY accessed_at DESC LIMIT 100')
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

module.exports = {
  db,
  initDatabase,
  projectQueries,
  fileQueries,
  commentQueries,
  logQueries,
  shareLinkQueries
};
