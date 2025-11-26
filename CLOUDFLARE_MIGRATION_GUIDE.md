# Cloudflare D1 Migration Guide

Complete guide for migrating Alternassist from Express + better-sqlite3 to Cloudflare Pages Functions + D1.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Setup](#database-setup)
3. [API Conversion Patterns](#api-conversion-patterns)
4. [Route Mapping](#route-mapping)
5. [Example Conversions](#example-conversions)
6. [Deployment Steps](#deployment-steps)
7. [Testing](#testing)

---

## Prerequisites

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create alternassist

# This will output your database_id - copy it to wrangler.toml
```

---

## Database Setup

### 1. Update wrangler.toml with your database_id

```toml
[[d1_databases]]
binding = "DB"
database_name = "alternassist"
database_id = "YOUR_DATABASE_ID_HERE"  # From 'wrangler d1 create' output
```

### 2. Apply migrations

```bash
# Local development database
wrangler d1 execute alternassist --local --file=./migrations/0001_initial_schema.sql

# Production database
wrangler d1 execute alternassist --file=./migrations/0001_initial_schema.sql
```

### 3. Verify schema

```bash
# Check tables
wrangler d1 execute alternassist --local --command="SELECT name FROM sqlite_master WHERE type='table'"

# Check a specific table
wrangler d1 execute alternassist --local --command="PRAGMA table_info(projects)"
```

---

## API Conversion Patterns

### Key Differences

| better-sqlite3 | Cloudflare D1 | Notes |
|---|---|---|
| `db.prepare().all()` | `await env.DB.prepare().all()` | Returns `{results, meta}` |
| `db.prepare().get()` | `await env.DB.prepare().first()` | Single row |
| `db.prepare().run()` | `await env.DB.prepare().run()` | Returns `{success, meta}` |
| Sync API | Async API | All operations need `await` |
| `res.json()` | `Response.json()` | Different response format |
| `req.body` | `await request.json()` | Body parsing |
| `req.params.id` | `context.params.id` | URL parameters |

### Query Method Conversion

**better-sqlite3:**
```javascript
const projects = db.prepare('SELECT * FROM projects').all();
const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name);
```

**D1:**
```javascript
const projects = await env.DB.prepare('SELECT * FROM projects').all();
// Returns: { results: [...], meta: {...} }

const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
// Returns: {...} or null

const result = await env.DB.prepare('INSERT INTO projects (name) VALUES (?)').bind(name).run();
// Returns: { success: true, meta: { last_row_id: 1, changes: 1 } }
```

### Transaction Conversion

**better-sqlite3:**
```javascript
const transaction = db.transaction(() => {
  db.prepare('INSERT INTO projects...').run(...);
  db.prepare('INSERT INTO estimates...').run(...);
});
transaction();
```

**D1:**
```javascript
await env.DB.batch([
  env.DB.prepare('INSERT INTO projects...').bind(...),
  env.DB.prepare('INSERT INTO estimates...').bind(...)
]);
```

---

## Route Mapping

### Directory Structure

```
functions/
├── api/
│   ├── projects/
│   │   ├── [id].js               # GET/PUT/DELETE /api/projects/:id
│   │   ├── index.js              # GET/POST /api/projects
│   │   ├── [id]/
│   │   │   ├── files.js          # GET /api/projects/:id/files
│   │   │   ├── activity.js       # GET /api/projects/:id/activity
│   │   │   └── unbilled-files.js # GET /api/projects/:id/unbilled-files
│   ├── invoices/
│   │   ├── [id].js               # GET/PATCH/DELETE /api/invoices/:id
│   │   ├── index.js              # GET/POST /api/invoices
│   │   └── [invoiceId]/
│   │       └── deliverables.js   # GET/POST /api/invoices/:invoiceId/deliverables
│   ├── files/
│   │   ├── [id].js               # GET/DELETE /api/files/:id
│   │   ├── upload.js             # POST /api/files/upload
│   │   └── comments/
│   │       └── [id].js           # PATCH/DELETE /api/files/comments/:id
│   ├── cues/
│   │   ├── [id].js               # GET/PUT/DELETE /api/cues/:id
│   │   └── index.js              # GET/POST /api/cues
│   ├── estimates/
│   │   ├── [id].js               # GET/PUT/DELETE /api/estimates/:id
│   │   └── index.js              # GET/POST /api/estimates
│   ├── payments/
│   │   ├── [id].js               # DELETE /api/payments/:id
│   │   └── index.js              # GET/POST /api/payments
│   ├── accounting/
│   │   ├── [id].js               # DELETE /api/accounting/:id
│   │   └── index.js              # GET/POST /api/accounting
│   └── hours-log/
│       └── index.js              # GET/POST /api/hours-log
```

### Complete Endpoint Mapping

**Projects (23 endpoints → 1 main file + nested)**
- `GET /api/projects` → `/functions/api/projects/index.js` (onRequestGet)
- `POST /api/projects` → `/functions/api/projects/index.js` (onRequestPost)
- `GET /api/projects/:id` → `/functions/api/projects/[id].js` (onRequestGet)
- `PATCH /api/projects/:id` → `/functions/api/projects/[id].js` (onRequestPatch)
- `DELETE /api/projects/:id` → `/functions/api/projects/[id].js` (onRequestDelete)
- `GET /api/projects/:id/files` → `/functions/api/projects/[id]/files.js` (onRequestGet)
- etc.

**Invoices (12 endpoints)**
- `GET /api/invoices` → `/functions/api/invoices/index.js` (onRequestGet)
- `POST /api/invoices` → `/functions/api/invoices/index.js` (onRequestPost)
- `GET /api/invoices/:id` → `/functions/api/invoices/[id].js` (onRequestGet)
- etc.

**Files (18 endpoints)**
- Similar pattern...

**Payments, Cues, Estimates, Accounting, Hours-log**
- Follow same pattern...

---

## Example Conversions

### Example 1: Simple GET endpoint

**Before (Express + better-sqlite3):**
```javascript
// server/routes/projects.js
router.get('/', (req, res) => {
  try {
    const projects = projectQueries.getAllWithStats.all();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**After (Pages Function + D1):**
```javascript
// functions/api/projects/index.js
export async function onRequestGet(context) {
  try {
    const { env } = context;

    // D1 query with .all() returns { results, meta }
    const result = await env.DB.prepare(`
      SELECT
        p.*,
        COUNT(f.id) as file_count,
        COALESCE(SUM(f.file_size), 0) as total_size
      FROM projects p
      LEFT JOIN files f ON p.id = f.project_id
      WHERE (p.archived IS NULL OR p.archived = 0)
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all();

    return Response.json(result.results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

### Example 2: POST endpoint with body parsing

**Before:**
```javascript
router.post('/', (req, res) => {
  try {
    const { name, client_name, status } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }

    const result = projectQueries.create.run(name, null, client_name, null, status);
    res.json({ id: result.lastInsertRowid, name, client_name, status });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

**After:**
```javascript
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const { name, client_name, status } = await request.json();

    if (!name) {
      return Response.json({ error: 'name required' }, { status: 400 });
    }

    const result = await env.DB.prepare(`
      INSERT INTO projects (name, client_name, status)
      VALUES (?, ?, ?)
    `).bind(name, client_name, status).run();

    return Response.json({
      id: result.meta.last_row_id,
      name,
      client_name,
      status
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
```

### Example 3: GET by ID with URL params

**Before:**
```javascript
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const project = projectQueries.findById.get(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**After:**
```javascript
// functions/api/projects/[id].js
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    const project = await env.DB.prepare(`
      SELECT * FROM projects WHERE id = ?
    `).bind(id).first();

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    return Response.json(project);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

### Example 4: Transaction (batch operations)

**Before:**
```javascript
const createInvoiceWithPayment = db.transaction(() => {
  const invoiceResult = invoiceQueries.create.run(...);
  const invoiceId = invoiceResult.lastInsertRowid;

  paymentQueries.create.run(invoiceId, ...);
  projectQueries.update.run(...);

  return invoiceId;
});

const invoiceId = createInvoiceWithPayment();
```

**After:**
```javascript
// D1 batch for atomic operations
const results = await env.DB.batch([
  env.DB.prepare(`
    INSERT INTO invoices (project_id, invoice_number, amount)
    VALUES (?, ?, ?)
  `).bind(projectId, invoiceNumber, amount),

  env.DB.prepare(`
    INSERT INTO payments (invoice_id, project_id, amount)
    VALUES (?, ?, ?)
  `).bind(invoiceId, projectId, paymentAmount),

  env.DB.prepare(`
    UPDATE projects SET status = ? WHERE id = ?
  `).bind(newStatus, projectId)
]);

const invoiceId = results[0].meta.last_row_id;
```

### Example 5: DELETE endpoint

**Before:**
```javascript
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    projectQueries.delete.run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**After:**
```javascript
export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    await env.DB.prepare(`
      DELETE FROM projects WHERE id = ?
    `).bind(id).run();

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

---

## Deployment Steps

### 1. Prepare Project Structure

```bash
# Create functions directory
mkdir -p functions/api

# Create public directory for static files
mkdir -p public

# Copy your frontend HTML/CSS/JS to public/
cp -r *.html *.css *.js public/
```

### 2. Convert Routes to Functions

Start with one route file at a time:

1. **Projects** (most complex, do last)
2. **Cues** (simpler, good starting point)
3. **Estimates** (similar to cues)
4. **Invoices** (moderate complexity)
5. **Payments** (simple)
6. **Files** (complex due to file handling)

### 3. Test Locally

```bash
# Start local dev server
wrangler pages dev public --d1=DB

# Your API will be available at:
# http://localhost:8788/api/projects
# http://localhost:8788/api/cues
# etc.
```

### 4. Update Frontend API Calls

**Before:**
```javascript
fetch('http://localhost:3000/api/projects')
```

**After:**
```javascript
fetch('/api/projects')  // Relative URLs work in Pages
```

### 5. Deploy to Cloudflare

```bash
# Deploy to production
wrangler pages deploy public --project-name=alternassist

# Run migrations on production D1
wrangler d1 execute alternassist --file=./migrations/0001_initial_schema.sql
```

---

## Testing

### Unit Testing D1 Queries

```javascript
// Example test with Miniflare
import { unstable_dev } from "wrangler";

describe("Projects API", () => {
  let worker;

  beforeAll(async () => {
    worker = await unstable_dev("functions/api/projects/index.js", {
      experimental: { disableExperimentalWarning: true },
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  it("should return all projects", async () => {
    const resp = await worker.fetch("/api/projects");
    const projects = await resp.json();
    expect(Array.isArray(projects)).toBe(true);
  });
});
```

### Manual Testing Checklist

- [ ] GET endpoints return correct data
- [ ] POST endpoints create records
- [ ] PATCH endpoints update records
- [ ] DELETE endpoints remove records
- [ ] Foreign key constraints work
- [ ] Triggers update denormalized stats
- [ ] Transactions roll back on error
- [ ] Authentication works (if implemented)

---

## Common Gotchas

### 1. DATETIME vs TEXT

D1 doesn't have native DATETIME - use TEXT and SQLite date functions:
```sql
-- Good
SELECT * FROM projects WHERE date(created_at) = date('now')

-- Bad (won't work)
SELECT * FROM projects WHERE created_at::DATE = NOW()
```

### 2. BOOLEAN is INTEGER

SQLite/D1 uses 0/1 for booleans:
```javascript
// Correct
archived: 1  // true
pinned: 0    // false
```

### 3. lastInsertRowid → last_row_id

```javascript
// better-sqlite3
result.lastInsertRowid

// D1
result.meta.last_row_id
```

### 4. Error Handling

D1 doesn't throw detailed errors - check `result.success`:
```javascript
const result = await env.DB.prepare('...').run();
if (!result.success) {
  // Handle error
}
```

### 5. Query Parameter Binding

Always use `.bind()` - NEVER string interpolation:
```javascript
// Good
env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id)

// Bad (SQL injection risk)
env.DB.prepare(`SELECT * FROM projects WHERE id = ${id}`)
```

---

## Next Steps

1. Create your first Pages Function (start with `/api/cues`)
2. Test locally with `wrangler pages dev`
3. Convert one route at a time
4. Update frontend to use relative URLs
5. Deploy when all routes are converted

---

## Resources

- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Pages Functions Guide](https://developers.cloudflare.com/pages/functions/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)
