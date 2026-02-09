# Alternassist - Technical Overview

## What Is Alternassist

Alternassist is a full-stack project management application built for music composition and post-production audio work. It runs as both a desktop Electron app and a web application deployed to Cloudflare Pages, with a shared Express backend and SQLite database.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ Electron App │    │ Web Browser  │    │  Client Portal   │   │
│  │ (Desktop)    │    │ (Admin)      │    │  (Project Auth)  │   │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘   │
│         │                   │                     │              │
│         │ localhost:3000    │ Cloudflare Tunnel    │              │
│         ▼                   ▼                     ▼              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   EXPRESS SERVER                          │   │
│  │  Port 3000 | Express 5.1 | Session Auth | Rate Limiting  │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  /api/admin      │ /api/projects   │ /api/files         │   │
│  │  /api/estimates   │ /api/invoices   │ /api/payments      │   │
│  │  /api/cues        │ /api/hours-log  │ /api/accounting    │   │
│  │  /api/ftp         │ /api/share      │ /api/downloads     │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  MIDDLEWARE: Auth | CORS | Rate Limit | Cache Control    │   │
│  └──────────┬──────────────────┬────────────────┬───────────┘   │
│             │                  │                │               │
│    ┌────────▼────────┐ ┌──────▼──────┐ ┌───────▼──────────┐   │
│    │ SQLite Database │ │ FTP Storage │ │ Background Jobs  │   │
│    │ alternaview.db  │ │ /Volumes/   │ │ FFmpeg transcode │   │
│    │ 13 tables       │ │ FTP1/       │ │ Folder sync      │   │
│    └─────────────────┘ └─────────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Cloudflare Pages (parallel deployment):
┌─────────────────────────────────────────┐
│  Static files from public/              │
│  Serverless functions from functions/   │
│  D1 SQLite database                     │
│  URL: alternassist.alternatone.com      │
└─────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 38.2.1 |
| Server | Express 5.1.0, Node.js |
| Database | SQLite (better-sqlite3 local, Cloudflare D1 remote) |
| Frontend | Vanilla HTML/CSS/JavaScript (no framework) |
| Auth | bcryptjs, express-session |
| File Upload | multer + tus protocol (resumable) |
| Video | FFmpeg via fluent-ffmpeg |
| Pro Tools | gRPC + PTSL protocol (localhost:31416) |
| Hosting | Cloudflare Pages + D1 + Tunnel |
| File Storage | External FTP drive (/Volumes/FTP1) |
| Typography | Crimson Text (serif), IBM Plex Mono (technical) |
| Color Palette | Brand guide: #4A90C8, #5B8C6E, #E8A45D, #D96459 |

---

## Database Schema (13 Tables)

### Core Tables

**projects** - Project metadata, status, client info, FTP folder path, pinning, scope summary, timestamps. Status values: `prospects`, `active`, `hold`, `completed`. Auto-tracks file_count and total_size via triggers.

**files** - Media files linked to projects. Tracks original path, transcoded path, MIME type, duration, folder (TO AA / FROM AA), transcoding status.

**comments** - Timecoded feedback on files. Supports threading (reply_to_id), status (open/resolved), billable flag, and invoice linking.

**cues** - Music cue tracking per project. Fields: cue_number, title, status (to-write → written → revisions → approved → complete), start/end timecodes, theme, version.

### Accounting Tables

**estimates** - Cost calculations: runtime, music minutes, hours by category, rates, bundle discounts, totals.

**invoices** - Invoice records with number, amounts (deposit/final split), status (draft → sent → paid), line items (JSON), dates.

**payments** - Payment records linked to invoices. Tracks method, type (deposit/balance/full), amount, date.

**invoice_deliverables** - Junction table linking invoices to delivered files.

**accounting_records** - General ledger entries: transaction type, category, amount, date.

### Supporting Tables

**project_scope** - Extended scope data per project (music minutes, hours breakdown by category).

**hours_log** - Time tracking entries by category (dialogue, sound-design, mix, revisions).

**share_links** - Public sharing tokens with optional expiry and password protection. Tracks access count and last accessed.

**access_logs** - Audit trail for file downloads, uploads, and share link access.

**admin_users** - Admin accounts with bcrypt-hashed passwords.

---

## Server Architecture

### Express Configuration (alternaview-server.js)

- **Port:** 3000
- **Trust Proxy:** Enabled (behind Cloudflare)
- **Session:** express-session with file-based secret, 24h max age, HTTP-only secure cookies
- **Rate Limiting:** 500 requests/15min (API), 10 attempts/15min (login)
- **CORS:** Whitelist for alternassist.alternatone.com and localhost
- **Static Files:** `/media/` serves public/, `/client/` serves client-portal/
- **Error Handling:** Centralized middleware for multer, SQLite, and auth errors

### Route Inventory

| Mount | File | Endpoints | Auth |
|-------|------|-----------|------|
| /api/admin | admin.js | login, logout, status, reset-password | Mixed |
| /api/projects | projects.js | CRUD, files, upload, sync, share, scope, activity | Mixed |
| /api/files | files.js | CRUD, stream, comments, public endpoints | Mixed |
| /api/upload | upload.js | Direct file upload (multer) | Session |
| /api/estimates | estimates.js | CRUD, scope management | None |
| /api/cues | cues.js | CRUD, project stats | None |
| /api/invoices | invoices.js | CRUD, deliverables, with-payment atomic | None |
| /api/payments | payments.js | CRUD, mark-invoice-paid atomic | None |
| /api/accounting | accounting.js | CRUD | None |
| /api/hours-log | hours-log.js | CRUD, project totals | None |
| /api/ftp | ftp-browser.js | browse, download, upload, tokens | Admin |
| /api/share + /share | share.js | generate, access, verify password, delete | Mixed |
| /api/downloads + /dl | downloads.js | generate tokens, download by token | Mixed |

### Authentication (server/middleware/auth.js)

Four auth strategies in priority order:
1. **Admin session** - req.session.isAdmin (full access)
2. **Client session** - req.session.projectId (project-scoped)
3. **URL parameter** - req.params.projectId (Electron app, no auth)
4. **Share token** - req.query.token (public share links)

### Services

**activity-tracker.js** - Logs all file/project/payment actions to access_logs table.

**folder-sync.js** - Scans FTP filesystem, syncs new files to database, watches for real-time changes via Chokidar.

**transcoder.js** - Background FFmpeg video optimization (H.264, 5 Mbps, 1080p max, AAC audio). Runs asynchronously after upload.

### Utilities

**cache.js** - In-memory TTL cache (30-60s). Wraps database queries, invalidated on writes. Used by projects, cues, invoices endpoints.

**password-generator.js** - Generates 16-char random hex passwords for new projects.

**response-helpers.js** - Express middleware adding res.success(), res.error(), res.notFound(), etc.

---

## Frontend Architecture

### Page Inventory

| Page | Purpose | Key Features |
|------|---------|-------------|
| index.html | Dashboard shell | Pinned project cards, module navigation, creative direction, hour tracking, cue progress |
| admin-login.html | Admin authentication | Username/password login |
| kanban.html | Project pipeline | 4-column drag-and-drop board, scope data, cue stats, archive |
| cues.html | Music cue tracking | Status workflow, timecodes, themes, statistics |
| notes.html | Pro Tools integration | Frame.io TXT import, PTSL marker creation |
| media.html | File management | Upload, delete, comment, transcode status |
| media_review.html | Media review | Video player, timecoded comments |
| media_browser.html | FTP file browser | Directory navigation, file operations |
| media_transfer.html | File transfer | Bulk file operations |
| estimates.html | Cost estimation | Scope input, rate calculation, bundle discounts |
| invoices.html | Invoice management | Generation, line items, deposit splits, status tracking |
| payments.html | Payment tracking | Record payments, link to invoices, mark paid |
| books.html | Accounting ledger | Transaction records, categories, reporting |
| ftp_admin.html | FTP administration | Browse, upload, create folders, download tokens |
| client_login.html | Client authentication | Project name + password |
| client_portal.html | Client file access | Browse, upload, download project files |
| public_viewer.html | Public media viewer | Video/audio player for share links, no auth required |

### Shared JavaScript

**api-helpers.js** - Global API client objects (ProjectsAPI, CuesAPI, EstimatesAPI, InvoicesAPI, PaymentsAPI, AccountingAPI, ScopeAPI). Auto-detects base URL for Electron/web/Cloudflare environments.

**admin-auth-check.js** - Authentication guard. Skips auth in Electron (trusted local app), redirects to login in browser if not authenticated.

**kanban-api-adapter.js** - Bridges localStorage kanban state with backend API. Loads from `/api/projects/with-scope`, tracks dirty projects, saves changes in parallel.

**media-app.js** - File upload management, video player integration, comment system.

---

## Electron Integration

### main.js (Main Process)

- Window: 1400x900, macOS hidden title bar, cream background
- Database: Copies alternaview.db to userData on first run
- Server: Starts Express on port 3000, then loads index.html
- Shutdown: Disconnects PTSL, stops server gracefully

### IPC Handlers

**Pro Tools (PTSL):**
- Connect/disconnect to Pro Tools via gRPC on localhost:31416
- Get session info (name, timecode, sample rate)
- Create markers from Frame.io TXT exports with progress updates

**File Dialogs:**
- Open .txt files (Frame.io exports)
- Select folders on FTP drive (with /Volumes/FTP1 security boundary)
- Create new project folders (sanitized names)

### preload.js (Context Bridge)

Exposes `window.electronAPI` with PTSL controls, file dialogs, and `isElectron()` detection. Context isolation enabled, node integration disabled.

---

## Cloudflare Deployment

### Static Hosting (Cloudflare Pages)
- Build output: `public/` directory
- `_redirects` file maps `/media/*` to `/*` for Express compatibility
- Deployed via `wrangler pages deploy public`

### Serverless Functions (functions/)
- File-based routing matching Express API structure
- Access D1 SQLite via `context.env.DB` binding
- Covers all CRUD endpoints for projects, cues, estimates, invoices, payments, accounting

### D1 Database
- Database name: alternassist
- Database ID: 623697d2-559e-41f0-adf0-d385799e949c
- Same schema as local SQLite, synced via migrations

### Cloudflare Tunnel
- Exposes local Express server at alternassist.alternatone.com
- Used for admin access when FTP drive is needed (file streaming, uploads)

---

## File Storage

### FTP Drive Architecture
```
/Volumes/FTP1/
├── [Project Folder Name]/
│   ├── TO AA/          ← Files coming from client (uploads, revisions)
│   │   └── filename-timestamp.ext
│   └── FROM AA/        ← Files going to client (deliverables)
│       └── filename-timestamp.ext
```

- Storage path configurable via alternaview-config.js
- Falls back to local `./ftp-storage` if FTP drive not mounted
- Folder sync watches for new files and updates database
- Video files auto-transcode to H.264/AAC on upload

---

## Security

| Feature | Implementation |
|---------|---------------|
| Password hashing | bcryptjs, cost factor 10 |
| Session security | HTTP-only, secure (prod), SameSite strict/lax |
| SQL injection | Prepared statements for all queries |
| Directory traversal | Path normalization, FTP sandbox |
| CORS | Origin whitelist |
| Rate limiting | 500 req/15min API, 10 req/15min login |
| File upload limits | 64GB max, MIME checking |
| Electron security | Context isolation, no node integration, preload bridge |
| Share links | Crypto random tokens, bcrypt passwords, expiry |
| Access logging | All file/project actions tracked in access_logs |

---

## Performance Optimizations

- **Database triggers** auto-update file_count/total_size on projects (eliminates N+1 queries)
- **In-memory cache** with 30-60s TTL on read-heavy endpoints
- **Aggregated queries** using JOINs and JSON_GROUP_ARRAY (single query per kanban card)
- **Parallel saves** on kanban (Promise.all for dirty projects)
- **Background transcoding** (upload returns immediately, FFmpeg runs async)
- **Prepared statements** for all database operations
- **Cache invalidation** on writes to keep data fresh

---

## Migrations

| Migration | Purpose |
|-----------|---------|
| 0001 | Initial schema (13 tables, indexes, triggers) |
| 0002 | Download tokens table |
| 0003 | Admin users table |
| 0004 | Remove plaintext passwords (bcrypt only) |
| 0005 | Share link password support |
| 0006 | Allow never-expiring download tokens |
| 0007 | Create share_links if missing (idempotent) |
| 0008 | Add ftp_path to share_links for direct file serving |
