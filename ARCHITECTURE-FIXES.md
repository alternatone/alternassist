# Alternassist Architecture Fixes - Implementation Plan

## Context
This document outlines fixes for identified architectural issues in the Alternassist Electron app. The app uses SQLite with an Express API layer, preparing for future web sync.

---

## Fix 1: Add Database Indexes for Performance

### Problem
Foreign key columns (`project_id`, `invoice_id`, etc.) are frequently queried but not indexed. SQLite auto-indexes PRIMARY KEYs and UNIQUE constraints but NOT foreign keys.

### Impact
Slow queries when filtering/joining on project_id, especially as data grows.

### Implementation

**File:** `/server/models/database.js`

**Add after table creation in `initDatabase()`:**

```javascript
// Create indexes for foreign keys and commonly queried fields
function createIndexes() {
  const indexes = [
    // Foreign key indexes
    'CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_share_links_project_id ON share_links(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_share_links_file_id ON share_links(file_id)',
    'CREATE INDEX IF NOT EXISTS idx_comments_file_id ON comments(file_id)',
    'CREATE INDEX IF NOT EXISTS idx_access_logs_project_id ON access_logs(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_estimates_project_id ON estimates(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_cues_project_id ON cues(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_payments_project_id ON payments(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id)',
    'CREATE INDEX IF NOT EXISTS idx_accounting_project_id ON accounting_records(project_id)',
    
    // Commonly queried fields
    'CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)',
    'CREATE INDEX IF NOT EXISTS idx_cues_status ON cues(status)',
    
    // Date range queries
    'CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date)',
    'CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)',
    'CREATE INDEX IF NOT EXISTS idx_accounting_date ON accounting_records(transaction_date)'
  ];
  
  indexes.forEach(sql => {
    db.exec(sql);
  });
  
  console.log('Database indexes created');
}

// Call after initDatabase()
createIndexes();
```

**Also add WAL mode for better concurrent performance:**

```javascript
// In database.js, right after db initialization
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON'); // Already have this
```

---

## Fix 2: Add Formal Migration System

### Problem
Current migration strategy is inline column checks with no version tracking, rollback capability, or failure handling.

### Implementation

**File:** `/server/models/database.js`

**Add migration system:**

```javascript
// Migration tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration runner
function runMigrations() {
  const migrations = [
    {
      version: 1,
      name: 'add_transcoded_file_path',
      up: () => {
        const columns = db.prepare("PRAGMA table_info(files)").all();
        if (!columns.some(col => col.name === 'transcoded_file_path')) {
          db.exec('ALTER TABLE files ADD COLUMN transcoded_file_path TEXT');
        }
      }
    },
    {
      version: 2,
      name: 'add_kanban_fields',
      up: () => {
        const columns = db.prepare("PRAGMA table_info(projects)").all();
        const kanbanFields = [
          { name: 'client_name', type: 'TEXT', default: null },
          { name: 'status', type: 'TEXT', default: "'prospects'" },
          { name: 'notes', type: 'TEXT', default: null },
          { name: 'pinned', type: 'BOOLEAN', default: '0' },
          { name: 'media_folder_path', type: 'TEXT', default: null },
          { name: 'password_protected', type: 'BOOLEAN', default: '0' }
        ];
        
        kanbanFields.forEach(field => {
          if (!columns.some(col => col.name === field.name)) {
            const defaultClause = field.default ? ` DEFAULT ${field.default}` : '';
            db.exec(`ALTER TABLE projects ADD COLUMN ${field.name} ${field.type}${defaultClause}`);
          }
        });
      }
    },
    {
      version: 3,
      name: 'add_cue_theme_column',
      up: () => {
        const columns = db.prepare("PRAGMA table_info(cues)").all();
        if (!columns.some(col => col.name === 'theme')) {
          db.exec('ALTER TABLE cues ADD COLUMN theme TEXT');
        }
      }
    }
  ];
  
  // Get current schema version
  const currentVersion = db.prepare(
    'SELECT MAX(version) as version FROM schema_migrations'
  ).get()?.version || 0;
  
  // Run pending migrations in transaction
  const runMigration = db.transaction((migration) => {
    console.log(`Running migration ${migration.version}: ${migration.name}`);
    migration.up();
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
  });
  
  migrations
    .filter(m => m.version > currentVersion)
    .forEach(migration => {
      try {
        runMigration(migration);
        console.log(`✓ Migration ${migration.version} complete`);
      } catch (error) {
        console.error(`✗ Migration ${migration.version} failed:`, error);
        throw error; // Stop on first failure
      }
    });
}

// Replace current migration code in initDatabase() with:
runMigrations();
```

**Add to module.exports:**
```javascript
module.exports = {
  db,
  initDatabase,
  runMigrations, // Add this
  // ... rest of exports
};
```

---

## Fix 3: Separate Theme from Notes in Cues Table

### Problem
The `notes` field is doing double duty - storing both themes and actual notes. This creates semantic confusion.

### Implementation

**Migration added above (version 3)** adds the `theme` column.

**File:** `/server/routes/cues.js`

**Update create endpoint:**
```javascript
router.post('/', (req, res) => {
  try {
    const {
      project_id,
      cue_number,
      title,
      status,
      duration,
      theme,  // Add this
      notes
    } = req.body;

    // ... validation ...

    const result = cueQueries.create.run(
      project_id,
      cue_number || '',
      title || '',
      status || 'to-write',
      duration || null,
      theme || null,   // Add this
      notes || null
    );

    const cue = cueQueries.findById.get(result.lastInsertRowid);
    res.json(cue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Update the prepared statement in database.js:**
```javascript
const cueQueries = {
  create: db.prepare('INSERT INTO cues (project_id, cue_number, title, status, duration, theme, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  // ... existing queries ...
  update: db.prepare('UPDATE cues SET cue_number = ?, title = ?, status = ?, duration = ?, theme = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
};
```

**Update patch endpoint in cues.js:**
```javascript
router.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      cue_number,
      title,
      status,
      duration,
      theme,  // Add this
      notes
    } = req.body;

    const cue = cueQueries.findById.get(id);
    if (!cue) {
      return res.status(404).json({ error: 'Cue not found' });
    }

    cueQueries.update.run(
      cue_number !== undefined ? cue_number : cue.cue_number,
      title !== undefined ? title : cue.title,
      status !== undefined ? status : cue.status,
      duration !== undefined ? duration : cue.duration,
      theme !== undefined ? theme : cue.theme,  // Add this
      notes !== undefined ? notes : cue.notes,
      id
    );

    const updatedCue = cueQueries.findById.get(id);
    res.json(updatedCue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**File:** `/HTML Sketches/cue_tracker_demo.html`

**Update the cue object structure throughout:**
```javascript
// In initializeSampleData()
cues[cue.project_id].push({
  id: cue.id,
  number: cue.cue_number,
  title: cue.title,
  startTime: '00:00:00',
  endTime: '00:00:00',
  theme: cue.theme || '',      // Use theme field
  status: cue.status,
  version: '',
  notes: cue.notes || '',      // Separate notes
  duration: cue.duration
});
```

**Update table rendering to show both:**
```javascript
// In renderCues(), replace the theme cell with:
<td><input type="text" list="themeList-${cue.id}" class="inline-theme-input" value="${cue.theme || ''}" onchange="updateCueField('${cue.id}', 'theme', this.value)" placeholder="Enter theme">
    <datalist id="themeList-${cue.id}"></datalist>
</td>
```

**Update the modal form to have separate fields:**
```html
<!-- In the modal HTML -->
<div class="form-group">
  <label for="cueTheme">Theme</label>
  <input type="text" id="cueTheme" list="themeList" placeholder="Enter or select theme">
  <datalist id="themeList"></datalist>
</div>
<div class="form-group full-width">
  <label for="cueNotes">Notes</label>
  <textarea id="cueNotes" placeholder="Instrumentation, mood, client feedback..."></textarea>
</div>
```

**Update saveCue() to save both:**
```javascript
async function saveCue() {
  const theme = document.getElementById('cueTheme').value;
  const notes = document.getElementById('cueNotes').value;
  
  // ...
  
  const apiData = {
    cue_number: number,
    title: title,
    status: status,
    duration: formatDuration(duration),
    theme: theme || null,
    notes: notes || null
  };
  
  // ... rest of function
}
```

---

## Fix 4: Add Error Handling and Loading States

### Problem
- No error boundaries if Express server crashes
- No loading spinners during API calls
- UI hangs during fetch operations

### Implementation Part A: Centralized Error Handling

**File:** `/HTML Sketches/api-helpers.js`

**Replace all API helper functions with centralized error handler:**

```javascript
// Add at top of file
class APIError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.details = details;
  }
}

// Centralized API caller
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      let errorDetails;
      try {
        errorDetails = await response.json();
      } catch (e) {
        errorDetails = { error: response.statusText };
      }
      throw new APIError(
        errorDetails.error || `Request failed: ${response.status}`,
        response.status,
        errorDetails
      );
    }
    
    return response.json();
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    // Network error or server not responding
    throw new APIError(
      'Cannot connect to server. Make sure the app is running.',
      0,
      { originalError: error.message }
    );
  }
}

// Then refactor all APIs to use it:
const ProjectsAPI = {
  getAll: () => apiCall('/projects'),
  getById: (id) => apiCall(`/projects/${id}`),
  create: (data) => apiCall('/projects', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => apiCall(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiCall(`/projects/${id}`, {
    method: 'DELETE'
  })
};

// Apply same pattern to all other APIs...
```

### Implementation Part B: Global Error Handler

**Add to each HTML file (example: cue_tracker_demo.html):**

```javascript
// Add near top of script section
function showError(error) {
  console.error('Application error:', error);
  
  let message = 'An error occurred';
  if (error instanceof APIError) {
    if (error.status === 0) {
      message = 'Cannot connect to server. Please restart the application.';
    } else {
      message = error.message;
    }
  } else {
    message = error.message || 'Unknown error occurred';
  }
  
  // Create error toast/banner
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff6b6b;
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: 400px;
  `;
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  
  setTimeout(() => errorDiv.remove(), 5000);
}

// Wrap all API calls with error handling
async function safeApiCall(apiFunction, errorContext = '') {
  try {
    return await apiFunction();
  } catch (error) {
    showError(error);
    throw error; // Re-throw so caller can handle if needed
  }
}
```

### Implementation Part C: Loading States

**Add global loading indicator CSS:**

```css
/* Add to <style> section of each HTML file */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(253, 248, 240, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

.loading-overlay.active {
  opacity: 1;
  pointer-events: all;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e0e0e0;
  border-top-color: var(--accent-teal);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

**Add loading overlay HTML:**

```html
<!-- Add before closing </body> tag -->
<div class="loading-overlay" id="loadingOverlay">
  <div class="loading-spinner"></div>
</div>
```

**Add loading helper functions:**

```javascript
let loadingCount = 0;

function showLoading() {
  loadingCount++;
  document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
  loadingCount--;
  if (loadingCount <= 0) {
    loadingCount = 0;
    document.getElementById('loadingOverlay').classList.remove('active');
  }
}

// Wrap API calls with loading indicator
async function apiCallWithLoading(apiFunction) {
  showLoading();
  try {
    return await apiFunction();
  } finally {
    hideLoading();
  }
}
```

**Example usage in cue_tracker_demo.html:**

```javascript
async function initializeSampleData() {
  try {
    showLoading();
    
    const projectsWithMusic = await getProjectsWithMusic();
    const allCues = await CuesAPI.getAll();
    
    // ... rest of function
    
  } catch (error) {
    showError(error);
  } finally {
    hideLoading();
  }
}

async function saveCue() {
  // ... validation ...
  
  try {
    showLoading();
    
    if (currentCueId) {
      await CuesAPI.update(currentCueId, apiData);
      // ... update local copy
    } else {
      const newCue = await CuesAPI.create(apiData);
      // ... add to local copy
    }
    
    hideCueModal();
    renderCues();
  } catch (error) {
    showError(error);
  } finally {
    hideLoading();
  }
}
```

---

## Fix 5: Add Cascade Delete Confirmations

### Problem
Deleting a project cascades to ALL related data (estimates, cues, invoices, payments) with no safety check at database level.

### Implementation

**File:** `/server/routes/projects.js`

**Add safety check before delete:**

```javascript
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    // Check what will be deleted
    const relatedData = {
      estimates: estimateQueries.findByProject.all(id).length,
      cues: cueQueries.findByProject.all(id).length,
      invoices: invoiceQueries.findByProject.all(id).length,
      payments: paymentQueries.findByProject.all(id).length,
      files: fileQueries.findByProject.all(id).length
    };
    
    const totalItems = Object.values(relatedData).reduce((sum, count) => sum + count, 0);
    
    // Return warning if there's related data
    if (totalItems > 0 && !req.query.confirm) {
      return res.status(409).json({
        error: 'Project has related data',
        warning: true,
        relatedData,
        message: `This project has ${totalItems} related items that will be permanently deleted. Add ?confirm=true to proceed.`
      });
    }
    
    projectQueries.delete.run(id);
    res.json({ 
      success: true, 
      message: 'Project deleted',
      deletedItems: relatedData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**File:** `/HTML Sketches/api-helpers.js`

**Update ProjectsAPI.delete:**

```javascript
const ProjectsAPI = {
  // ... other methods ...
  
  async delete(id) {
    // First try without confirm to get warning
    try {
      return await apiCall(`/projects/${id}`, { method: 'DELETE' });
    } catch (error) {
      if (error.status === 409 && error.details.warning) {
        // Show confirmation dialog
        const relatedData = error.details.relatedData;
        const items = Object.entries(relatedData)
          .filter(([_, count]) => count > 0)
          .map(([type, count]) => `${count} ${type}`)
          .join(', ');
        
        const message = `This will permanently delete:\n\n${items}\n\nThis cannot be undone. Continue?`;
        
        if (confirm(message)) {
          // Retry with confirm flag
          return await apiCall(`/projects/${id}?confirm=true`, { method: 'DELETE' });
        } else {
          throw new Error('Delete cancelled by user');
        }
      }
      throw error;
    }
  }
};
```

**Add same pattern for invoice deletes** (which cascade to payments):

**File:** `/server/routes/invoices.js`

```javascript
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    // Check for related payments
    const payments = paymentQueries.findByInvoice.all(id);
    
    if (payments.length > 0 && !req.query.confirm) {
      return res.status(409).json({
        error: 'Invoice has payments',
        warning: true,
        paymentCount: payments.length,
        message: `This invoice has ${payments.length} payment(s) totaling $${payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}. Add ?confirm=true to proceed.`
      });
    }
    
    invoiceQueries.delete.run(id);
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## Fix 6: Add Server Lifecycle Management

### Problem
If Express server fails to start or crashes, the Electron app doesn't handle it gracefully.

### Implementation

**File:** `/alternaview-server.js`

**Add health check and retry logic:**

```javascript
let serverInstance = null;
let startupAttempts = 0;
const MAX_STARTUP_ATTEMPTS = 3;

function startServer() {
  if (serverInstance) {
    console.log('Alternaview server already running');
    return Promise.resolve(serverInstance);
  }

  return new Promise((resolve, reject) => {
    const app = express();
    
    // ... existing middleware setup ...

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ... existing routes ...

    // Start server with error handling
    try {
      serverInstance = app.listen(config.port, () => {
        console.log(`Alternaview server running on http://localhost:${config.port}`);
        startupAttempts = 0;
        resolve(serverInstance);
      });

      serverInstance.on('error', (err) => {
        console.error('Server error:', err);
        
        if (err.code === 'EADDRINUSE') {
          console.error(`Port ${config.port} is already in use`);
          
          if (startupAttempts < MAX_STARTUP_ATTEMPTS) {
            startupAttempts++;
            // Try different port
            config.port = config.port + 1;
            console.log(`Retrying on port ${config.port}...`);
            serverInstance = null;
            setTimeout(() => {
              startServer().then(resolve).catch(reject);
            }, 1000);
          } else {
            reject(new Error(`Failed to start server after ${MAX_STARTUP_ATTEMPTS} attempts`));
          }
        } else {
          reject(err);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Add graceful shutdown
function stopServer() {
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => {
        console.log('Alternaview server stopped');
        serverInstance = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  startServer,
  stopServer,
  config,
  isRunning: () => !!serverInstance
};
```

**Create health check utility:**

**File:** `/HTML Sketches/server-health.js` (NEW FILE)

```javascript
// Server health monitoring
const SERVER_HEALTH_CHECK_INTERVAL = 5000; // 5 seconds
let healthCheckInterval = null;
let isServerHealthy = true;

async function checkServerHealth() {
  try {
    const response = await fetch('http://localhost:3000/health', {
      method: 'GET',
      cache: 'no-cache'
    });
    
    if (response.ok) {
      if (!isServerHealthy) {
        console.log('Server connection restored');
        isServerHealthy = true;
        // Trigger UI update - server is back
        window.dispatchEvent(new CustomEvent('server-reconnected'));
      }
      return true;
    }
  } catch (error) {
    if (isServerHealthy) {
      console.error('Server connection lost');
      isServerHealthy = false;
      // Trigger UI update - server is down
      window.dispatchEvent(new CustomEvent('server-disconnected'));
    }
    return false;
  }
}

function startHealthCheck() {
  if (healthCheckInterval) return;
  
  healthCheckInterval = setInterval(checkServerHealth, SERVER_HEALTH_CHECK_INTERVAL);
  checkServerHealth(); // Check immediately
}

function stopHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// Auto-start when page loads
if (typeof window !== 'undefined') {
  window.addEventListener('load', startHealthCheck);
  window.addEventListener('unload', stopHealthCheck);
  
  // Expose globally
  window.ServerHealth = {
    check: checkServerHealth,
    isHealthy: () => isServerHealthy,
    start: startHealthCheck,
    stop: stopHealthCheck
  };
}
```

**Add to HTML files:**

```html
<script src="server-health.js"></script>
<script>
  // Listen for server disconnection
  window.addEventListener('server-disconnected', () => {
    showError({ 
      message: 'Lost connection to server. Attempting to reconnect...' 
    });
  });
  
  window.addEventListener('server-reconnected', () => {
    // Show success message
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--accent-green);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
    `;
    successDiv.textContent = 'Server connection restored';
    document.body.appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 3000);
    
    // Reload data
    initializeSampleData();
  });
</script>
```

---

## Fix 7: Debounce Rapid Updates in Cue Tracker

### Problem
Every keystroke in inline editing triggers an API call, creating unnecessary load and potential race conditions.

### Implementation

**File:** `/HTML Sketches/cue_tracker_demo.html`

**Add debounce utility:**

```javascript
// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Store pending updates
const pendingUpdates = new Map();

async function updateCueField(cueId, fieldName, newValue) {
  const cue = cues[currentProject].find(c => c.id === cueId);
  if (!cue) return;
  
  // Update local copy immediately for UI responsiveness
  cue[fieldName] = newValue;
  
  // Store pending update
  if (!pendingUpdates.has(cueId)) {
    pendingUpdates.set(cueId, {});
  }
  pendingUpdates.get(cueId)[fieldName] = newValue;
  
  // Debounced API call
  debouncedUpdateCue(cueId);
  
  // Immediate UI updates for certain fields
  if (fieldName === 'theme' || fieldName === 'startTime' || fieldName === 'endTime' || fieldName === 'status') {
    renderCues();
  }
  if (fieldName === 'status') {
    updateStats();
  }
}

// Debounced update function
const debouncedUpdateCue = debounce(async (cueId) => {
  const updates = pendingUpdates.get(cueId);
  if (!updates) return;
  
  const cue = cues[currentProject].find(c => c.id === cueId);
  if (!cue) return;
  
  try {
    const apiData = {
      cue_number: cue.number,
      title: cue.title,
      status: cue.status,
      duration: cue.duration || null,
      theme: cue.theme || null,
      notes: cue.notes || null
    };
    
    await CuesAPI.update(cueId, apiData);
    pendingUpdates.delete(cueId);
  } catch (error) {
    console.error('Error updating cue:', error);
    showError(error);
    // Could revert local changes here if desired
  }
}, 500); // Wait 500ms after last keystroke
```

---

## Testing Checklist

After implementing these fixes, verify:

### Database & Migrations
- [ ] Run `npm start` - migrations execute without errors
- [ ] Check `schema_migrations` table exists and has version records
- [ ] Verify indexes exist: `SELECT * FROM sqlite_master WHERE type='index'`
- [ ] Test WAL mode is active: `.pragma journal_mode` in sqlite3 CLI

### Cue Theme/Notes Separation
- [ ] Create new cue with both theme and notes
- [ ] Verify both fields save independently
- [ ] Check theme dropdown suggests existing themes
- [ ] Confirm notes field is separate in display

### Error Handling
- [ ] Stop the Express server manually
- [ ] Verify error toast appears
- [ ] Verify health check detects disconnection
- [ ] Restart server, verify reconnection message
- [ ] Try creating data while server is down - should show error

### Loading States
- [ ] Create/update/delete operations show loading spinner
- [ ] Multiple rapid operations don't stack spinners
- [ ] Loading spinner disappears after completion

### Cascade Delete Protection
- [ ] Try deleting project with data - should show confirmation
- [ ] Cancel confirmation - verify nothing deleted
- [ ] Confirm deletion - verify cascade works
- [ ] Try deleting invoice with payments - should show confirmation

### Debouncing
- [ ] Rapidly type in cue inline fields
- [ ] Verify only one API call after typing stops (check network tab)
- [ ] Verify local UI updates immediately

### Performance
- [ ] Load page with 100+ cues - should be fast
- [ ] Filter cues by project - should use indexes
- [ ] Check query performance in console logs

---

## Rollback Plan

If migrations fail:

1. Stop the app
2. Backup current database: `cp ~/alternassist/alternaview.db ~/alternassist/alternaview.db.backup`
3. Delete migrations table: `DELETE FROM schema_migrations;`
4. Restart app to re-run migrations
5. If still failing, restore backup: `cp ~/alternassist/alternaview.db.backup ~/alternassist/alternaview.db`

---

## Future Considerations

### When Building Web Sync:

1. **Timestamp Handling**: Add `last_modified` INTEGER column to all tables storing unix timestamps
2. **Conflict Resolution**: Implement last-write-wins or operational transform
3. **Offline Queue**: Store failed API calls in IndexedDB when offline
4. **WebSocket Updates**: Real-time updates when other clients modify data
5. **Authentication**: Add JWT or session-based auth to API routes

### Project Scope Consolidation:

Consider moving `project_scope` fields directly into `projects` table if always loaded together. This would eliminate JOINs and simplify queries. Can be done as a future migration.

---

## Implementation Order

Suggested order to minimize conflicts:

1. **Fix 2** - Migration system (foundation for everything else)
2. **Fix 1** - Database indexes (immediate performance win)
3. **Fix 3** - Theme/notes separation (small schema change)
4. **Fix 4A & 4B** - Error handling (no schema changes)
5. **Fix 6** - Server health monitoring (no schema changes)
6. **Fix 4C** - Loading states (UI only)
7. **Fix 7** - Debouncing (optimization)
8. **Fix 5** - Cascade confirmations (safety feature)

Each step can be implemented and tested independently.
