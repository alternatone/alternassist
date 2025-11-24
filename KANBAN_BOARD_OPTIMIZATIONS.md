# Kanban Board Backend Optimizations

## Overview
Analysis of all backend functions tied to kanban_board.html buttons and calculations. This page manages project workflow across columns (Prospects → In Production → In Review → Approved & Billed → Archive).

## Files Analyzed
- `public/kanban_board.html` (main UI)
- `public/kanban-api-adapter.js` (backend abstraction layer)
- `server/routes/projects.js` (project CRUD)
- `server/routes/estimates.js` (scope data)
- `server/routes/hours-log.js` (logged hours)
- `server/routes/cues.js` (cue tracker integration)

---

## Critical Issue #1: N+1 Query in loadProjects()
**Location:** `kanban-api-adapter.js:24-89`

### Current Implementation (SLOW)
```javascript
async loadProjects() {
  // 1 query: Fetch ALL projects
  const response = await fetch('http://localhost:3000/api/projects');
  const apiProjects = await response.json();

  // N queries: Fetch scope for EACH project in a loop
  const scopePromises = apiProjects.map(async (p) => {
    const scopeResponse = await fetch(
      `http://localhost:3000/api/estimates/scope/${p.id}`
    );
    return { projectId: p.id, scope: await scopeResponse.json() };
  });

  const scopesData = await Promise.all(scopePromises);
  // ...transform data
}
```

### Problems
- **N+1 queries**: 1 query for projects + N queries for scopes (where N = number of projects)
- If you have 50 projects, this makes 51 API requests on every page load
- Each request has network overhead (latency, TCP handshake, etc.)
- No caching between page loads or modal opens

### Solution: Single JOIN Query
```javascript
// NEW BACKEND ROUTE: GET /api/projects/with-scope
async loadProjects() {
  const response = await fetch('http://localhost:3000/api/projects/with-scope');
  const projects = await response.json();
  // All data in 1 query!
}
```

**Backend query** (add to `server/models/database.js`):
```javascript
getAllWithScope: db.prepare(`
  SELECT
    p.id,
    p.name,
    p.client_name,
    p.status,
    p.notes,
    p.pinned,
    p.music_coverage,
    ps.contact_email,
    ps.music_minutes,
    ps.dialogue_hours,
    ps.sound_design_hours,
    ps.mix_hours,
    ps.revision_hours
  FROM projects p
  LEFT JOIN project_scope ps ON ps.project_id = p.id
  ORDER BY p.updated_at DESC
`)
```

**Performance Impact:** 50+ requests → 1 request (50x faster on 50 projects)

---

## Critical Issue #2: Sequential Saves in saveProjects()
**Location:** `kanban-api-adapter.js:94-136`

### Current Implementation (SLOW)
```javascript
async saveProjects(projects) {
  // Loop through ALL projects and save SEQUENTIALLY
  for (const project of projects) {
    if (isNewProject(project.id)) {
      await fetch('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(apiData)
      });
    } else {
      await fetch(`http://localhost:3000/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify(apiData)
      });
    }
  }
}
```

### Problems
- **Sequential execution**: Waits for each request to complete before starting the next
- **Updates ALL projects**: Even when only 1 project changed (e.g., drag-and-drop)
- **No dirty tracking**: No way to know which projects actually changed
- For 50 projects, this could take 5-10 seconds if each request takes 100-200ms

### Solution: Track Changes + Batch Updates
```javascript
// Track which projects have changed
let dirtyProjects = new Set();

function markDirty(projectId) {
  dirtyProjects.add(projectId);
}

async saveProjects(projects) {
  // Only save projects that changed
  const toSave = projects.filter(p => dirtyProjects.has(p.id));

  if (toSave.length === 0) return;

  // Save in parallel (not sequential)
  await Promise.all(toSave.map(project => {
    const apiData = transformToAPIFormat(project);

    if (isNewProject(project.id)) {
      return fetch('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(apiData)
      });
    } else {
      return fetch(`http://localhost:3000/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify(apiData)
      });
    }
  }));

  dirtyProjects.clear();
}
```

**Performance Impact:** 5-10 seconds → 100-200ms for single project updates

---

## Critical Issue #3: Multiple Sequential API Calls in editProject()
**Location:** `kanban_board.html:568-745`

### Current Implementation (SLOW)
```javascript
async function editProject(id) {
  // Sequential call #1: Get scope data
  const scopeResponse = await fetch(
    `http://localhost:3000/api/estimates/scope/${project.id}`
  );
  const scopeFromAPI = await scopeResponse.json();

  // Sequential call #2: Get cues (only if in-process/review/approved)
  const projectCues = await CuesAPI.getByProject(project.id);

  // Sequential call #3: Get logged hours
  const hoursResponse = await fetch(
    `http://localhost:3000/api/hours-log/project/${project.id}/totals`
  );
  const loggedHoursFromAPI = await hoursResponse.json();

  // Then populate modal...
}
```

### Problems
- **Waterfall requests**: Each request waits for the previous one to complete
- Total time = Request1 + Request2 + Request3 (e.g., 100ms + 150ms + 100ms = 350ms)
- Called every time user clicks a project card
- No caching of this data

### Solution #1: Parallel Requests
```javascript
async function editProject(id) {
  // Fetch all data in parallel
  const [scopeFromAPI, projectCues, loggedHoursFromAPI] = await Promise.all([
    fetch(`http://localhost:3000/api/estimates/scope/${project.id}`)
      .then(r => r.json()),
    CuesAPI.getByProject(project.id),
    fetch(`http://localhost:3000/api/hours-log/project/${project.id}/totals`)
      .then(r => r.json())
  ]);

  // Populate modal...
}
```

**Performance:** 350ms → 150ms (time of slowest request)

### Solution #2: Single Aggregated Backend Query (BETTER)
```javascript
// NEW BACKEND ROUTE: GET /api/projects/:id/kanban-data
async function editProject(id) {
  const response = await fetch(
    `http://localhost:3000/api/projects/${id}/kanban-data`
  );
  const { project, scope, cueStats, loggedHours } = await response.json();
  // All data in 1 request!
}
```

**Backend query** (add to `server/models/database.js`):
```javascript
getKanbanData: db.prepare(`
  SELECT
    p.id, p.name, p.client_name, p.status, p.notes,
    ps.contact_email, ps.music_minutes, ps.dialogue_hours,
    ps.sound_design_hours, ps.mix_hours, ps.revision_hours,
    (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND status = 'to-write') as cues_to_write,
    (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND status = 'written') as cues_written,
    (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND status = 'revisions') as cues_revisions,
    (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND status = 'approved') as cues_approved,
    (SELECT SUM(hours) FROM hours_log WHERE project_id = p.id AND category = 'dialogue') as logged_dialogue,
    (SELECT SUM(hours) FROM hours_log WHERE project_id = p.id AND category = 'sound-design') as logged_sound_design,
    (SELECT SUM(hours) FROM hours_log WHERE project_id = p.id AND category = 'mix') as logged_mix,
    (SELECT SUM(hours) FROM hours_log WHERE project_id = p.id AND category = 'revisions') as logged_revisions
  FROM projects p
  LEFT JOIN project_scope ps ON ps.project_id = p.id
  WHERE p.id = ?
`)
```

**Performance Impact:** 3 requests + client-side calculation → 1 request

---

## Critical Issue #4: Client-Side Cue Aggregation
**Location:** `kanban_board.html:643-698`

### Current Implementation (SLOW)
```javascript
// Fetch ALL cues for the project
const projectCues = await CuesAPI.getByProject(project.id);

// Client-side filtering to count statuses
const toWrite = projectCues.filter(c => normalizeStatus(c.status) === 'to-write').length;
const written = projectCues.filter(c => normalizeStatus(c.status) === 'written').length;
const revisions = projectCues.filter(c => normalizeStatus(c.status) === 'revisions').length;
const approved = projectCues.filter(c => normalizeStatus(c.status) === 'approved').length;

// Client-side calculation of approved duration
const approvedMinutes = approvedCues.reduce((total, cue) => {
  const start = timeToSeconds(cue.start_time || '00:00:00');
  const end = timeToSeconds(cue.end_time || '00:00:00');
  const durationSeconds = end - start;
  return total + (durationSeconds / 60);
}, 0);
```

### Problems
- **Transfers all cue data** over the network (could be 100+ cues with full details)
- **Client-side aggregation** when database can do this much faster
- Database has indexes for fast COUNT/SUM operations
- Client wastes CPU/memory on filtering and calculations

### Solution: Backend Aggregation
```javascript
// NEW BACKEND ROUTE: GET /api/cues/project/:id/stats
async function loadCueStats(projectId) {
  const response = await fetch(
    `http://localhost:3000/api/cues/project/${projectId}/stats`
  );
  return await response.json();
  // Returns: { toWrite: 5, written: 10, revisions: 3, approved: 12, approvedMinutes: 45 }
}
```

**Backend query** (add to `server/models/database.js`):
```javascript
getCueStatsByProject: db.prepare(`
  SELECT
    COUNT(CASE WHEN status = 'to-write' THEN 1 END) as to_write,
    COUNT(CASE WHEN status = 'written' THEN 1 END) as written,
    COUNT(CASE WHEN status = 'revisions' THEN 1 END) as revisions,
    COUNT(CASE WHEN status = 'approved' OR status = 'complete' THEN 1 END) as approved,
    SUM(CASE
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
    END) as approved_minutes
  FROM cues
  WHERE project_id = ?
`)
```

**Performance Impact:** Transfers 100+ cue records → transfers 5 numbers

---

## Critical Issue #5: No Caching
**Location:** Throughout kanban_board.html and kanban-api-adapter.js

### Current Problems
- `loadProjects()` called multiple times per session, always refetches
- Every modal open refetches project data (scope, cues, hours)
- Same scope data fetched in `loadProjects()` and `editProject()`
- No cache invalidation strategy

### Solution: Add Backend Caching
```javascript
// In server/routes/projects.js
const cache = require('../utils/cache');

router.get('/with-scope', (req, res) => {
  try {
    const projects = cache.wrap(
      'projects:with-scope',
      () => projectQueries.getAllWithScope.all(),
      60000  // 1 minute cache
    );
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/kanban-data', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = cache.wrap(
      `projects:kanban-data:${id}`,
      () => projectQueries.getKanbanData.get(id),
      30000  // 30 second cache
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Invalidate cache on mutations
router.patch('/:id', (req, res) => {
  // ...update logic...
  cache.invalidate('projects:with-scope');
  cache.invalidate(`projects:kanban-data:${id}`);
  // ...
});
```

**Performance Impact:** Eliminates redundant database queries for frequently accessed data

---

## Critical Issue #6: Inefficient Drag-and-Drop
**Location:** `kanban_board.html:395-415`

### Current Implementation (SLOW)
```javascript
function handleDrop(e) {
  const newColumn = column.dataset.column;
  const projectId = draggedElement.dataset.id;

  const project = projects.find(p => p.id === projectId);
  if (project) {
    project.column = newColumn;
    saveProjects();  // SAVES ALL PROJECTS!
    renderBoard();
  }
}
```

### Problems
- Calls `saveProjects()` which loops through ALL projects
- Only 1 project changed but we update everything
- No optimistic UI update (waits for server confirmation)

### Solution: Update Single Project + Optimistic UI
```javascript
async function handleDrop(e) {
  const newColumn = column.dataset.column;
  const projectId = draggedElement.dataset.id;

  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  // Optimistic UI update
  project.column = newColumn;
  renderBoard();

  // Update only this project on backend
  try {
    await fetch(`http://localhost:3000/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: columnToStatus(newColumn)
      })
    });

    // Invalidate cache
    cache.invalidate('projects:with-scope');
  } catch (error) {
    console.error('Failed to update project:', error);
    // Revert optimistic update on failure
    await loadProjects();
    renderBoard();
  }
}
```

**Performance Impact:** Updates ALL projects → updates 1 project (instant UI feedback)

---

## Summary of Optimizations

| Issue | Current | Optimized | Impact |
|-------|---------|-----------|--------|
| N+1 in loadProjects() | 51 requests (50 projects) | 1 request | **50x faster** |
| Sequential saves | 5-10 seconds | 100-200ms | **25-50x faster** |
| Sequential editProject() | 350ms (3 requests) | 150ms (1 request) | **2-3x faster** |
| Client-side cue aggregation | Transfers 100+ records | Transfers 5 numbers | **20x less data** |
| No caching | Every request hits DB | Cached for 30-60s | **Instant on cache hit** |
| Drag-and-drop updates all | Updates 50 projects | Updates 1 project | **50x faster** |

## Implementation Priority

1. **High Priority** (Biggest impact, easiest to implement):
   - Add GET /api/projects/with-scope (fixes N+1)
   - Add dirty tracking to saveProjects() (fixes batch saves)
   - Add backend caching with 30-60s TTL

2. **Medium Priority**:
   - Add GET /api/projects/:id/kanban-data (aggregated endpoint)
   - Add GET /api/cues/project/:id/stats (cue aggregation)
   - Update handleDrop to only save changed project

3. **Low Priority** (Nice to have):
   - Add frontend caching layer
   - Add loading states and skeleton screens
   - Add websocket for real-time updates

## Expected Overall Performance

- **Initial page load**: 2-3 seconds → 200-300ms (10x faster)
- **Opening project modal**: 350ms → 150ms (2x faster, instant with cache)
- **Drag-and-drop**: 5 seconds → 100ms (50x faster)
- **Network traffic**: Reduced by 80-90%
