# Alternassist Web Sync Implementation Plan
## Using Cloudflare Workers + D1

---

## Overview
Implement cloud sync between the Electron desktop app and web version using Cloudflare's free tier services. This will allow seamless data synchronization across devices using your existing Cloudflare domain.

---

## Architecture

### Components
1. **Cloudflare Worker** - API endpoints for data sync
2. **Cloudflare D1** - SQLite database for persistent storage
3. **Client Sync Logic** - Added to Alternassist app
4. **Authentication** - Simple token-based auth

### Data Flow
```
Alternassist App (localStorage)
       ↕ (sync)
Cloudflare Worker API
       ↕
   D1 Database
```

---

## Phase 1: Cloudflare Setup

### 1.1 Install Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

### 1.2 Create Worker Project
```bash
mkdir alternassist-sync
cd alternassist-sync
wrangler init
```

### 1.3 Create D1 Database
```bash
wrangler d1 create alternassist-db
```

### 1.4 Database Schema
```sql
-- Users table (simple auth)
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    auth_token TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sync data table (stores all localStorage data)
CREATE TABLE sync_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    data_key TEXT NOT NULL,
    data_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, data_key)
);

-- Create index for faster lookups
CREATE INDEX idx_user_data ON sync_data(user_id, data_key);
```

---

## Phase 2: API Endpoints

### Worker Routes

#### `POST /api/auth/register`
- Create new user account
- Generate auth token
- Return token to client

#### `POST /api/auth/login`
- Validate email
- Return existing auth token

#### `GET /api/sync`
- Headers: `Authorization: Bearer <token>`
- Returns: All user's localStorage data
- Response:
```json
{
  "success": true,
  "data": {
    "kanban-projects": "[...]",
    "outstanding-payments": "[...]",
    "accountingTransactions": "[...]",
    "cue-tracker-sessions": "[...]"
  },
  "lastSync": "2025-10-07T12:00:00Z"
}
```

#### `POST /api/sync`
- Headers: `Authorization: Bearer <token>`
- Body: localStorage data to sync
- Merges or overwrites based on timestamps
- Response:
```json
{
  "success": true,
  "synced": ["kanban-projects", "accountingTransactions"],
  "conflicts": []
}
```

#### `PUT /api/sync/:key`
- Update specific localStorage key
- Used for incremental updates

---

## Phase 3: Client-Side Sync Logic

### 3.1 Add Sync Manager (`sync-manager.js`)

```javascript
class SyncManager {
    constructor() {
        this.apiBase = 'https://your-domain.com/api';
        this.token = localStorage.getItem('sync-token');
        this.syncInterval = null;
    }

    async login(email) {
        // Login or register
    }

    async syncUp() {
        // Upload localStorage to cloud
    }

    async syncDown() {
        // Download cloud data to localStorage
    }

    async fullSync() {
        // Bidirectional sync with conflict resolution
    }

    startAutoSync(intervalMs = 60000) {
        // Auto-sync every minute
    }

    stopAutoSync() {
        // Stop auto-sync
    }
}
```

### 3.2 localStorage Keys to Sync
- `kanban-projects` (Projects)
- `kanban-columns` (Project board state)
- `outstanding-payments` (Invoices)
- `alternatone-payments` (Payment history)
- `accountingTransactions` (Accounting data)
- `cue-tracker-sessions` (Cue tracker data)
- `estimates` (If stored)

### 3.3 Sync UI Component
Add sync status indicator to nav bar:
- 🟢 Synced
- 🟡 Syncing...
- 🔴 Offline
- Last synced: "2 minutes ago"

---

## Phase 4: Conflict Resolution

### Strategy: Last-Write-Wins with Timestamps
1. Each sync adds `_syncedAt` timestamp to data
2. Compare timestamps on conflict
3. Keep most recent version
4. Optionally show conflict notification to user

### Future Enhancement: Merge Logic
For arrays (projects, transactions), merge by ID rather than overwrite

---

## Phase 5: Implementation Steps

### Step 1: Set up Cloudflare Worker
- [ ] Create worker project
- [ ] Set up D1 database
- [ ] Run schema migrations
- [ ] Deploy worker to your domain

### Step 2: Build API
- [ ] Implement auth endpoints
- [ ] Implement sync endpoints
- [ ] Add CORS headers
- [ ] Test with Postman/curl

### Step 3: Client Integration
- [ ] Create `sync-manager.js`
- [ ] Add sync UI to nav bar
- [ ] Hook into localStorage operations
- [ ] Add "Sign In" modal

### Step 4: Test & Deploy
- [ ] Test sync between desktop and web
- [ ] Test conflict resolution
- [ ] Test offline mode
- [ ] Deploy to production

---

## Security Considerations

### Authentication
- Use secure random tokens (crypto.randomUUID())
- Store tokens securely
- Add token expiration (optional)

### API Security
- Validate all inputs
- Rate limiting on Worker
- HTTPS only (enforced by Cloudflare)
- No sensitive data in URLs

### Data Privacy
- All data encrypted in transit (HTTPS)
- D1 data at rest encryption (default)
- User can only access their own data

---

## Cost Analysis (Free Tier Limits)

### Cloudflare Workers
- 100,000 requests/day FREE
- Estimated usage: ~1,000/day (single user, auto-sync every minute)
- ✅ Well within free tier

### Cloudflare D1
- 5GB storage FREE
- 5M reads/day, 100K writes/day FREE
- Estimated usage: < 10MB, ~2K writes/day
- ✅ Well within free tier

### Total Cost: $0/month

---

## Rollback Plan

If issues occur:
1. Disable auto-sync in client
2. Keep localStorage as source of truth
3. Fix worker issues
4. Re-enable sync

Data is never deleted from localStorage without user confirmation.

---

## Future Enhancements

### Phase 6 (Optional)
- [ ] Add email/password auth (instead of just token)
- [ ] Real-time sync using WebSockets
- [ ] Backup/restore functionality
- [ ] Export data as JSON
- [ ] Multi-device management UI
- [ ] Sync history/audit log
- [ ] Collaborative features (share projects)

---

## Files to Create

```
alternassist-sync/
├── wrangler.toml          # Worker config
├── src/
│   ├── index.js           # Main worker code
│   ├── auth.js            # Auth handlers
│   ├── sync.js            # Sync handlers
│   └── db.js              # D1 queries
└── schema.sql             # Database schema

Alternassist/
├── js/
│   └── sync-manager.js    # Client sync logic
└── HTML Sketches/
    └── sync-ui.html       # Sync status component
```

---

## Timeline Estimate

- **Phase 1-2 (Backend)**: 2-3 hours
- **Phase 3 (Client)**: 2-3 hours
- **Phase 4-5 (Testing)**: 1-2 hours
- **Total**: 5-8 hours of development

---

## Next Steps

1. Finish remaining app features
2. Review this plan
3. Begin Phase 1: Cloudflare setup
4. Test thoroughly before production deployment

---

**Note**: This plan assumes single-user personal use. For multi-user, add proper authentication (email/password) and user management.
