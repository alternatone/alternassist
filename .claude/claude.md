# Alternassist - Claude Context

## Project Overview
Alternassist is an all-in-one project management and workflow Electron app for creative professionals. It combines project tracking, financial management, media review, and Pro Tools integration into a unified desktop application.

**Tech Stack:** Electron + Node.js + Express + SQLite (better-sqlite3) + SvelteKit (migrating from Vanilla JS)

---

## Current Priority: Svelte Migration — Audit Complete

We are on branch `svelte-migration`. All pages have been audited and functional discrepancies fixed. The audit+fix pass is **complete** as of 2026-02-10.

**What was done:**
1. Every page was audited — discrepancies documented in `MIGRATION_AUDIT.md`
2. All functional/behavioral discrepancies were fixed in the Svelte versions
3. Design system differences (fonts, colors) were kept as-is (new design system retained)
4. Architecture differences in Media pages (legacy tree browser vs Svelte two-view) noted but not changed — Svelte approach is more modern
5. Hours page is a standalone improvement over legacy's embedded-only approach

### Page Mapping (Original → Svelte)

| Original (public/) | Svelte (frontend/src/routes/) | Status |
|---|---|---|
| index.html | /+page.svelte + /+layout.svelte + Navigation.svelte | **Fixed** |
| kanban.html | /kanban/+page.svelte | **Fixed** |
| cues.html | /cues/+page.svelte | **Fixed** |
| estimates.html | /estimates/+page.svelte | **Fixed** |
| invoices.html | /invoices/+page.svelte | **Fixed** |
| payments.html | /payments/+page.svelte | **Fixed** |
| books.html | /books/+page.svelte | **Fixed** |
| notes.html | /notes/+page.svelte | **Fixed** |
| media.html | /media/+page.svelte | **Fixed** (architecture differs) |
| media_browser.html | /media/browser/+page.svelte | **Fixed** (architecture differs) |
| media_review.html | /media/review/+page.svelte | **Fixed** |
| media_transfer.html | /media/transfer/+page.svelte | **Fixed** (architecture differs) |
| ftp_admin.html | (no Svelte equivalent yet) | N/A |
| admin-login.html | /login/+page.svelte | **Fixed** |
| client_login.html | /client/login/+page.svelte | **Fixed** |
| client_portal.html | /client/portal/+page.svelte | **Fixed** |
| public_viewer.html | /viewer/+page.svelte | Not audited |
| (hours log - embedded) | /hours/+page.svelte | **Fixed** (standalone, more capable) |

### Audit Process
For each page:
1. Read the original vanilla HTML/JS file thoroughly
2. Read the corresponding Svelte component
3. Compare: UI layout, all interactive features, API calls, event handlers, modals/dialogs, edge cases, error handling, styling
4. Document every discrepancy
5. Fix each one in the Svelte version

### Key Files for the Migration
- **Original frontend:** `public/*.html` (vanilla HTML/JS, inline `<script>` and `<style>`)
- **Svelte frontend:** `frontend/src/routes/` (SvelteKit pages)
- **Shared components:** `frontend/src/lib/components/` (Navigation, media components, shared UI)
- **API layer:** `frontend/src/lib/api/` (TypeScript API client modules)
- **Stores:** `frontend/src/lib/stores/` (auth, electron detection)
- **SvelteKit config:** `frontend/svelte.config.js` (static adapter, outputs to `public-svelte/`)
- **Original public assets moved to:** `public-legacy/` (if applicable)

---

## Quick Reference

### Launch & Kill (CRITICAL)

**ALWAYS kill existing instances before launching:**

```bash
# Safe kill (never use killall Electron - kills VS Code!)
pkill -9 -f "Alternassist.*Electron"

# Safe launch (background)
nohup npm start > /dev/null 2>&1 & echo "PID: $!"

# Combined relaunch
pkill -9 -f "Alternassist.*Electron" && sleep 1 && nohup npm start > /dev/null 2>&1 &
```

### Development Commands
```bash
npm start              # Launch Electron app (serves public/)
npm run dev:svelte     # Run SvelteKit dev server (frontend/)
npm run build:frontend # Build Svelte to public-svelte/
npm run build          # Build distributable (dist/Alternassist.app)
```

---

## Architecture

### Hybrid Deployment Model
- **Desktop:** Electron app with SQLite database
- **Web/Cloud:** Cloudflare Pages + D1 (SQLite-compatible)
- **Media Files:** FTP storage + client portal

### Project Structure
```
alternassist/
├── public/               # Original vanilla HTML/JS frontend (reference)
├── public-legacy/        # Backup of original public/ (if moved)
├── frontend/             # SvelteKit app (migration target)
│   ├── src/
│   │   ├── routes/      # SvelteKit pages (one per original HTML page)
│   │   ├── lib/
│   │   │   ├── api/     # TypeScript API client modules
│   │   │   ├── components/ # Shared Svelte components
│   │   │   └── stores/  # Svelte stores (auth, electron)
│   │   └── hooks.server.ts
│   ├── svelte.config.js  # Static adapter → public-svelte/
│   └── vite.config.ts
├── server/
│   ├── routes/          # Express API endpoints (10 routes)
│   ├── models/          # Database layer (database.js)
│   ├── middleware/      # Auth & session management
│   └── services/        # Activity tracking
├── client-portal/       # Client-facing media review
├── functions/api/       # Cloudflare Pages Functions
├── migrations/          # Database schema
├── src/notemarker/      # Pro Tools PTSL integration
├── main.js             # Electron main process
├── alternaview-server.js # Express server
└── wrangler.toml       # Cloudflare config
```

---

## Backend Routes (server/routes/)
- **projects.js** - Project CRUD, archiving, activity
- **files.js** - File upload, comments, metadata
- **invoices.js** - Invoice generation & tracking
- **payments.js** - Payment records & status
- **estimates.js** - Cost estimates & scope
- **cues.js** - Cue management
- **accounting.js** - Financial transactions
- **hours-log.js** - Time tracking
- **ftp-browser.js** - FTP file operations
- **upload.js** - Resumable uploads (tus protocol)

---

## Database Schema (SQLite)

**13 Tables:**
- `projects` - Project metadata, status, dates
- `files` - Media files (FTP-backed)
- `comments` - File comments (timecode-based)
- `invoices` - Invoice records
- `payments` - Payment tracking
- `estimates` - Cost estimates
- `estimate_scope_items` - Estimate line items
- `cues` - Music cue tracking
- `hours_log` - Time entries
- `accounting` - Financial transactions
- `activity_log` - System activity tracking
- `client_access` - Client portal auth
- `kanban_state` - UI state persistence

**Migration:** [migrations/0001_initial_schema.sql](migrations/0001_initial_schema.sql)

---

## Design System

### Typography
```css
--font-primary: 'DM Sans'          /* Buttons, UI */
--font-display: 'Bricolage Grotesque' /* Headers */
--font-body: 'Public Sans'         /* Body text */
--font-mono: 'Archivo'             /* Numbers, code */
```

### Colors
```css
--accent-teal: #469FE0    /* Primary actions */
--accent-blue: #007acc
--accent-green: #51cf66
--accent-red: #ff6b6b
--bg-primary: #FDF8F0
--bg-secondary: #FEFDFA
```

**Button Rule:** All buttons must explicitly set `font-family: var(--font-primary);`

---

## Key Integrations

### NoteMarker (Pro Tools PTSL)
- **Purpose:** Import Frame.io comments as Pro Tools markers
- **Connection:** localhost:31416 (requires Pro Tools running)
- **Files:** [src/notemarker/](src/notemarker/)
- **IPC Channels:** `ptsl:connect`, `ptsl:createMarkersFromFile`

### Alternaview (Media Review)
- **Server:** [alternaview-server.js](alternaview-server.js)
- **Client Portal:** [client-portal/](client-portal/)
- **Features:** Video review, timecode comments, resumable uploads
- **Upload Protocol:** tus (chunked, resumable)

### FTP Storage
- **Location:** [ftp-storage/](ftp-storage/)
- **Migration Scripts:** [server/scripts/migrate-to-ftp.js](server/scripts/migrate-to-ftp.js)
- **Backup:** [server/scripts/backup-ftp.js](server/scripts/backup-ftp.js)

---

## Important Patterns
1. **All API routes** return JSON with proper error handling
2. **Database queries** use prepared statements (better-sqlite3)
3. **File uploads** use resumable tus protocol
4. **Activity logging** auto-tracks all project changes
5. **Client access** secured with bcrypt password hashing
6. **Svelte API layer** in `frontend/src/lib/api/` wraps all backend endpoints with typed TypeScript functions
7. **Svelte components** use Svelte 5 runes syntax (`$state`, `$derived`, `$effect`)

---

## Troubleshooting

**Electron won't launch:**
- Kill existing instances: `pkill -9 -f "Alternassist.*Electron"`
- Check node version: `node --version` (v18+)
- Rebuild native modules: `npm rebuild better-sqlite3`

**Database errors:**
- Check file exists: `ls -la alternaview.db`
- Verify schema: `sqlite3 alternaview.db ".schema"`
- Check permissions: `chmod 644 alternaview.db`

**PTSL connection fails:**
- Ensure Pro Tools is running
- Enable PTSL in Pro Tools preferences
- Check port 31416 is available: `lsof -i :31416`

**SvelteKit dev server issues:**
- Run from `frontend/` directory: `npm run dev`
- Or from root: `npm run dev:svelte`
- Check that backend Express server is running (API calls proxy to it)
