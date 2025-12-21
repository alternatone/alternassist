# Alternassist - Claude Context

## Project Overview
Alternassist is an all-in-one project management and workflow Electron app for creative professionals. It combines project tracking, financial management, media review, and Pro Tools integration into a unified desktop application.

**Tech Stack:** Electron + Node.js + Express + SQLite (better-sqlite3) + Vanilla JS

**Latest Sync:** Dec 21, 2025 | Commit: `d69c710` (52 commits pulled from remote)

---

## Quick Reference

### Launch & Kill (CRITICAL)

**⚠️ ALWAYS kill existing instances before launching:**

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
npm start              # Launch Electron app
npm run build         # Build distributable (dist/Alternassist.app)
wrangler pages dev    # Test Cloudflare Pages locally
wrangler pages deploy # Deploy to Cloudflare
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
├── public/               # Frontend HTML modules (15 pages)
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

## Core Modules

### Frontend Pages (public/)
- **[kanban.html](public/kanban.html)** - Project pipeline & task management
- **[cues.html](public/cues.html)** - Music cue tracking
- **[estimates.html](public/estimates.html)** - Project budgeting
- **[invoices.html](public/invoices.html)** - Invoice generation
- **[payments.html](public/payments.html)** - Payment tracking
- **[books.html](public/books.html)** - Accounting & transactions
- **[notes.html](public/notes.html)** - NoteMarker (Frame.io → Pro Tools)
- **[media.html](public/media.html)** - Media management & upload
- **[ftp_admin.html](public/ftp_admin.html)** - FTP file management
- **[client_portal.html](public/client_portal.html)** - Client media review

### Backend Routes (server/routes/)
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

## Deployment

### Cloudflare Pages Setup
See **[DEPLOYMENT.md](DEPLOYMENT.md)** for full guide.

**Quick deploy:**
```bash
# 1. Create D1 database
wrangler d1 create alternassist

# 2. Update wrangler.toml with database_id

# 3. Apply schema
wrangler d1 execute alternassist --file=migrations/0001_initial_schema.sql

# 4. Deploy
wrangler pages deploy public
```

**API Functions:** [functions/api/](functions/api/) automatically map to `/api/*` routes

---

## Development Notes

### Recent Major Changes (52 commits)
- ✅ Complete SQLite migration (all pages migrated)
- ✅ Cloudflare Pages + D1 deployment setup
- ✅ FTP storage migration for media files
- ✅ Client portal authentication
- ✅ Activity tracking service
- ✅ Response caching layer
- ✅ Reorganized: `HTML Sketches/` → `public/`

### Data Persistence
- **Electron:** SQLite database ([alternaview.db](alternaview.db))
- **Cloudflare:** D1 database (serverless SQLite)
- **Files:** FTP storage (not in git)
- **Session:** express-session + bcryptjs auth

### Important Patterns
1. **All API routes** return JSON with proper error handling
2. **Database queries** use prepared statements (better-sqlite3)
3. **File uploads** use resumable tus protocol
4. **Activity logging** auto-tracks all project changes
5. **Client access** secured with bcrypt password hashing

---

## Common Tasks

### Add a new page
1. Create HTML in [public/](public/)
2. Add route in [alternaview-server.js](alternaview-server.js)
3. Add nav link in [public/index.html](public/index.html)
4. Use CSS variables for styling

### Add API endpoint
1. Create in [server/routes/](server/routes/) or [functions/api/](functions/api/)
2. Import in [alternaview-server.js](alternaview-server.js)
3. Add database queries in [server/models/database.js](server/models/database.js)
4. Test locally before deploying

### Database changes
1. Create migration: `migrations/000X_description.sql`
2. Test locally: `sqlite3 alternaview.db < migrations/000X_description.sql`
3. Deploy to D1: `wrangler d1 execute alternassist --file=migrations/000X_description.sql`

---

## Testing Checklist

Before deployment, verify:
- [ ] Electron app launches without errors
- [ ] All modules load correctly
- [ ] Database queries work (local SQLite)
- [ ] PTSL connection (if Pro Tools available)
- [ ] File upload/download
- [ ] API endpoints return expected data
- [ ] Client portal login works
- [ ] Cloudflare Pages builds successfully

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

**Cloudflare deployment issues:**
- Verify database_id in [wrangler.toml](wrangler.toml)
- Check function exports: `onRequestGet`, `onRequestPost`
- Review logs: Cloudflare Pages dashboard

---

## File References

**Core Config:**
- [package.json](package.json) - Dependencies & scripts
- [wrangler.toml](wrangler.toml) - Cloudflare config
- [alternaview-config.js](alternaview-config.js) - Server settings

**Entry Points:**
- [main.js](main.js) - Electron main process
- [alternaview-server.js](alternaview-server.js) - Express server
- [public/index.html](public/index.html) - Main UI shell

**Documentation:**
- [README.md](README.md) - Project overview
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [functions/api/files/_README.md](functions/api/files/_README.md) - R2 integration guide

---

**Last Updated:** 2025-12-21 | Local & remote repositories synchronized ✓
