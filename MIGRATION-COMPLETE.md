# SQLite Migration - Phase 1 Complete ✅

## Overview
Successfully migrated alternassist from hybrid localStorage/SQLite storage to a unified SQLite database architecture. This prepares the app for cloud synchronization and eliminates data duplication issues.

---

## What Was Built

### 1. Database Schema ✅
**Location:** `/server/models/database.js`

**New Tables Created:**
- `project_scope` - Structured scope data (music minutes, dialogue/sound/mix/revision hours, contact email)
- `estimates` - Complete estimate history with cost breakdowns
- `cues` - Music cue tracker (number, title, status, duration, notes)
- `invoices` - Invoice management with line items and payment tracking
- `payments` - Payment records linked to invoices and projects
- `accounting_records` - Financial transaction tracking

**Key Features:**
- Foreign key constraints for data integrity
- CASCADE deletes (delete project → deletes all related data)
- UNIQUE constraints on critical fields
- Timestamps for all records (created_at, updated_at)
- Proper data types (INTEGER, REAL, TEXT, DATE, BOOLEAN)

---

### 2. API Routes ✅
**Location:** `/server/routes/`

**New Endpoints:**

#### **Estimates** (`/api/estimates`)
- `GET /` - Get all estimates
- `GET /project/:projectId` - Get estimates for specific project
- `POST /` - Create new estimate
- `DELETE /:id` - Delete estimate
- `GET /scope/:projectId` - Get project scope
- `POST /scope` - Create/update project scope (upsert)

#### **Cues** (`/api/cues`)
- `GET /` - Get all cues
- `GET /project/:projectId` - Get cues for specific project
- `POST /` - Create new cue
- `PATCH /:id` - Update cue
- `DELETE /:id` - Delete cue
- `DELETE /project/:projectId` - Delete all cues for project

#### **Invoices** (`/api/invoices`)
- `GET /` - Get all invoices
- `GET /:id` - Get invoice by ID (includes payments)
- `GET /project/:projectId` - Get invoices for specific project
- `POST /` - Create new invoice
- `PATCH /:id` - Update invoice
- `DELETE /:id` - Delete invoice

#### **Payments** (`/api/payments`)
- `GET /` - Get all payments
- `GET /project/:projectId` - Get payments for specific project
- `GET /invoice/:invoiceId` - Get payments for specific invoice
- `POST /` - Create new payment
- `DELETE /:id` - Delete payment

---

### 3. Migrated Pages ✅

#### **estimate_calculator.html**
**Before:** Stored estimates in localStorage `logged-estimates`

**After:**
- Creates project via `/api/projects`
- Saves scope data to `project_scope` table via `/api/estimates/scope`
- Logs estimate to `estimates` table via `/api/estimates`
- Loads/displays estimates from database
- Delete functionality uses API

**Benefits:**
- Estimates linked to projects with foreign keys
- Full cost breakdown stored (music_cost, post_cost, discount, total)
- No localStorage dependency

---

#### **kanban_board.html + kanban-api-adapter.js**
**Before:** Parsed JSON from `projects.notes` field for scope data

**After:**
- Fetches scope from `project_scope` table
- Displays structured scope on prospect cards
- Clean separation: notes for text, scope table for data

**Benefits:**
- Queryable scope fields
- No JSON parsing
- Better performance

---

#### **index.html (Dashboard)**
**Before:**
- Loaded projects from API
- Loaded cues from localStorage `cue-tracker-cues`
- Had to join data client-side

**After:**
- Fetches projects from API
- Fetches cues from API
- Groups cues by project_id
- No localStorage dependency

**Benefits:**
- Single source of truth
- Automatic updates when cues change
- Clean data flow

---

### 4. API Helper Library ✅
**Location:** `/HTML Sketches/api-helpers.js`

**Purpose:** Centralized API wrapper functions for consistency

**Exports:**
- `ProjectsAPI` - CRUD for projects
- `CuesAPI` - CRUD for cues
- `EstimatesAPI` - CRUD for estimates
- `ScopeAPI` - Scope management
- `InvoicesAPI` - CRUD for invoices
- `PaymentsAPI` - CRUD for payments
- `getProjectsWithMusic()` - Helper to find projects with music scope

**Usage:**
```javascript
// Include in HTML
<script src="api-helpers.js"></script>

// Use in code
const projects = await ProjectsAPI.getAll();
const cues = await CuesAPI.getByProject(projectId);
await CuesAPI.create({ project_id: 5, cue_number: '1m1', title: 'Main Theme', ... });
```

---

### 5. Migration Script ✅
**Location:** `/migrate-localstorage.js`

**Purpose:** Browser-based tool to migrate existing localStorage data to SQLite

**What It Migrates:**
1. **Logged Estimates** (`logged-estimates`) → `estimates` table
2. **Cue Tracker Data** (`cue-tracker-cues`) → `cues` table
3. **Project Scope JSON** (from `projects.notes`) → `project_scope` table
4. **Invoices** (if stored in localStorage) → `invoices` table

**How to Use:**
1. Open alternassist app
2. Open browser DevTools console (Cmd+Option+I)
3. Copy/paste the migration script
4. Run: `await migrateLocalStorageToAPI()`
5. Review migration report
6. Run: `clearOldLocalStorageData()` to clean up

**Output Example:**
```
==================================================
📊 MIGRATION SUMMARY
==================================================
Estimates:  12 migrated, 0 errors
Cues:       47 migrated, 0 errors
Scope Data: 8 migrated, 0 errors
Invoices:   3 migrated, 0 errors
Payments:   0 migrated, 0 errors
==================================================
✅ Migration completed successfully!
```

---

## What's Left (Future Work)

### Pages Still Using localStorage:
1. **cue_tracker_demo.html** - Still uses `localStorage.getItem('cue-tracker-cues')`
   - **Migration Path:** Replace with `CuesAPI` from api-helpers.js

2. **invoice_generator_standalone.html** - Still uses localStorage for invoices
   - **Migration Path:** Replace with `InvoicesAPI` from api-helpers.js

3. **payment_dashboard.html** - Still uses localStorage for payment tracking
   - **Migration Path:** Replace with `PaymentsAPI` from api-helpers.js

4. **accounting.html** - Still uses localStorage for accounting records
   - **Migration Path:** Create `/api/accounting` route, use API calls

---

## Key Benefits Achieved

### ✅ No More Duplication
- Before: Project data in SQLite, estimates in localStorage, cues in localStorage
- After: Everything in SQLite with proper foreign key relationships

### ✅ Data Integrity
- Cascade deletes: Delete project → all estimates/cues/invoices deleted automatically
- Foreign key constraints prevent orphaned data
- UNIQUE constraints on critical fields

### ✅ Queryability
- Before: Can't search "projects with >20 music minutes" without loading all data and parsing JSON
- After: `SELECT * FROM project_scope WHERE music_minutes > 20`

### ✅ Cloud-Sync Ready
- Single SQLite file can be synced to server
- Prepared for centralized server architecture
- Web app can point to same API endpoints

### ✅ Better Performance
- No parsing JSON from text fields
- Indexed foreign keys for fast joins
- Single database query instead of multiple localStorage reads

---

## Database Schema Diagram

```
projects (id, name, client_name, status, notes, pinned, ...)
    ↓ (1-to-1)
project_scope (project_id, music_minutes, dialogue_hours, ...)
    ↓ (1-to-many)
estimates (project_id, runtime, music_cost, total_cost, ...)
    ↓ (1-to-many)
cues (project_id, cue_number, title, status, duration, ...)
    ↓ (1-to-many)
invoices (project_id, invoice_number, amount, status, ...)
    ↓ (1-to-many)
payments (invoice_id, project_id, amount, payment_date, ...)
```

---

## Next Steps

### Option 1: Complete Remaining Page Migrations
Continue migrating cue tracker, invoice generator, payment dashboard, and accounting pages to use SQLite API.

### Option 2: Build Cloud Sync
Implement server sync layer:
1. Add `synced_at` timestamps to all tables
2. Create sync service to push/pull changes
3. Build conflict resolution (last-write-wins or operational transforms)
4. Deploy cloud PostgreSQL or hosted SQLite (Turso/LiteFS)

### Option 3: Build Web App
Create web version that uses same API:
1. React/Vue/Svelte frontend
2. Points to cloud API server
3. Real-time updates via WebSocket
4. Shares database with Electron app

---

## Files Modified

### Core Database:
- `/server/models/database.js` - Schema + query definitions
- `/server/routes/estimates.js` - NEW
- `/server/routes/cues.js` - NEW
- `/server/routes/invoices.js` - NEW
- `/server/routes/payments.js` - NEW
- `/alternaview-server.js` - Registered new routes

### Migrated Pages:
- `/HTML Sketches/estimate_calculator.html` - Uses SQLite API
- `/HTML Sketches/kanban_board.html` - Uses scope table
- `/HTML Sketches/kanban-api-adapter.js` - Fetches scope data
- `/index.html` - Fetches cues from API

### New Files:
- `/HTML Sketches/api-helpers.js` - Centralized API wrapper
- `/migrate-localstorage.js` - Browser migration tool
- `/MIGRATION-COMPLETE.md` - This document

---

## Testing Checklist

- [ ] Start app: `npm start`
- [ ] Create new estimate → Check `estimates` table has record
- [ ] Send estimate to projects → Check `project_scope` table populated
- [ ] View Kanban board → Verify scope data displays on prospect cards
- [ ] View dashboard → Verify pinned projects show (no JSON in creative direction)
- [ ] Delete estimate → Verify removed from logged estimates list
- [ ] Delete project → Verify cascade deletes estimates + scope + cues
- [ ] Run migration script → Verify localStorage data transfers to SQLite
- [ ] Clear localStorage → Verify app still works (using SQLite)

---

## Technical Notes

### Why SQLite vs PostgreSQL?
- **Portability:** Single file, easy to backup/sync
- **Performance:** Fast for local/embedded use
- **Zero-config:** No separate database server
- **Future:** Can migrate to PostgreSQL later if needed (SQL is similar)

### Why Foreign Keys?
- **Data Integrity:** Can't create estimate for non-existent project
- **Cascade Deletes:** Delete project = delete all related data automatically
- **Queryability:** Fast joins between related tables

### Why Upsert for Scope?
- **Convenience:** Don't need to check if scope exists before saving
- **Idempotent:** Can call multiple times safely
- **SQLite Feature:** `ON CONFLICT ... DO UPDATE` is built-in

---

**Migration Status:** ✅ Phase 1 Complete (Core infrastructure + 3 pages migrated)

**Next:** Complete remaining pages OR build cloud sync layer OR deploy web app
