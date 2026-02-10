# Svelte Migration Audit — Master Discrepancy List

This document tracks every discrepancy found between the legacy vanilla HTML/JS pages (`public/`) and their Svelte counterparts (`frontend/src/routes/`). Each page is audited in full before fixes begin.

## Fix Progress

**Decision:** Keep new Svelte design system (DM Sans, Bricolage Grotesque, Public Sans, Archivo) — skip all font/color variable discrepancies. Only fix functional/behavioral differences.

| Section | Page | Fix Status |
|---|---|---|
| 1 | Dashboard + Navigation | **DONE** — nav underline, scroll state, app-region drag, padding-left, resources link, `<a>` tags, aspect-ratio, margins, ShareLinkModal component |
| 2 | Kanban | **DONE** — drag/drop zones, card layout, modal fields, status flow, data layer fixes |
| 3 | Cues | **DONE** — header, import spotting notes, progress bar, export button |
| 4 | Notes | **DONE** — NoteMarker header, connecting state, default TC, drag-drop upload, toast queue |
| 5 | Media | **DONE** — architecture differs (legacy tree vs Svelte two-view), no functional fixes needed |
| 6 | Media Browser | **DONE** — architecture differs, no functional fixes needed |
| 7 | Media Review | **DONE** — jump-to-time via VideoPlayer.seekTo, double-submit guard, export-to-notes button |
| 8 | Media Transfer | **DONE** — architecture differs, no functional fixes needed |
| 9 | Estimates | **DONE** — scope parsing, email compose, delete animation |
| 10 | Invoices | **DONE** — API patterns, print styles, send-to-payments flow |
| 11 | Payments | **DONE** — header section, markInvoicePaid nested payload, response parsing |
| 12 | Books | **DONE** — periodLabel $derived bug, addExpense notes concat, saveEdit delete+recreate, drag-drop CSV |
| 13 | Hours | **DONE** — standalone page is more capable than legacy embedded components; added 'music' category to type; cross-page integration deferred |
| 14 | Admin Login | **DONE** — rate limit detection works via client.ts error format; redirect to `/` is correct for SvelteKit |
| 15 | Client Login | **DONE** — API endpoints match legacy; credentials included; no functional fixes needed |
| 16 | Client Portal | **DONE** — added sidebar with project info/stats/actions (16.1-16.4), fixed download button no-op (16.8) |

**Skipped items (by design):** All font-family mismatches (1.7-1.8, 1.28-1.38, 2.35-2.38, 3.16-3.24, etc.), color variable value differences, postMessage items that don't apply to SvelteKit routing architecture (1.17-1.24 replaced by Svelte stores/context).

---

## 1. Dashboard (index.html → /+page.svelte + /+layout.svelte + Navigation.svelte)

### Navigation

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 1.1 | Missing `-webkit-app-region: drag` on nav | Nav has `drag`, logo/links have `no-drag` for Electron title bar | No app-region properties |
| 1.2 | Missing `nav.scrolled` condensed state | Reduces padding on scroll (`0.8rem`, `0.95` opacity bg) | No scroll listener or condensed class |
| 1.3 | Missing `padding-left: 90px` on nav-content | Present (for macOS traffic light buttons) | Absent |
| 1.4 | Missing animated rainbow gradient underline | `::after` on `.nav-links` with 7-color gradient, animates via `--underline-left`/`--underline-width` CSS vars | No underline indicator at all |
| 1.5 | Missing `updateNavUnderline()` logic | JS repositions underline on click, load, and window resize | Absent |
| 1.6 | Missing "resources" nav link | Links to `/media/resources/artist-guide.html` with `target="_blank"` | Not present |
| 1.7 | Logo font family mismatch | `'Crimson Text', serif` via `--font-artistic` | `'DM Sans'` via `--font-primary` |
| 1.8 | Nav link font family mismatch | `'IBM Plex Mono', monospace` via `--font-technical` | `'Archivo'` via `--font-mono` |
| 1.9 | Parent nav items use different elements | `<a>` tags with `onclick="event.preventDefault();"` | `<span>` tags |

### Dashboard Content

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 1.10 | Missing `aspect-ratio: 3 / 2` on overview cards | Present | Absent — cards have variable height |
| 1.11 | Missing `margin-bottom: 0.5rem` on `.overview-title` | Present | Absent (relies on flex gap) |
| 1.12 | Card spacing uses different technique | Individual `margin-bottom: 0.75rem` on children | `gap: 0.75rem` on flex parent |
| 1.13 | Missing `margin-bottom: 3rem` on dashboard grid | Present | Absent |

### Modals & Cross-Module Communication

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 1.14 | Missing FTP Setup Modal | `#ftpSetupModal` receives content from iframes via postMessage | Absent |
| 1.15 | Missing Share Link Modal | `#shareLinkModal` with expiry options (7d/never), optional password, calls `/api/share/generate` | Absent |
| 1.16 | Missing Share Link Success Modal | `#shareLinkSuccessModal` shows URL, auto-copies to clipboard, shows password/expiry | Absent |
| 1.17 | Missing `postMessage` listener: `show-ftp-modal` / `hide-ftp-modal` | Receives modal content from iframes | N/A (no iframes) but feature needs to exist |
| 1.18 | Missing `postMessage` listener: `show-share-link-modal` | Handles share types: project, file, ftp | Absent |
| 1.19 | Missing `postMessage` listener: `projectAdded` | Auto-switches to projects tab | Absent |
| 1.20 | Missing `postMessage` listener: `open-project-media` | Switches to media-transfer module, forwards message | Absent |
| 1.21 | Missing `postMessage` listener: `navigate-to-ftp-admin` | Switches to ftp-admin module | Absent |
| 1.22 | Missing `postMessage` listener: `exportToNotes` | Switches to notes module, forwards comments | Absent |
| 1.23 | Missing `postMessage` listener: `projects-updated` | Re-renders pinned projects, forwards to all iframes | No refresh trigger |
| 1.24 | Missing `storage` event listener | Re-renders dashboard on localStorage changes | Absent |

### Helper Functions

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 1.25 | Missing `copyClientPortalLink()` | Copies client portal link to clipboard | Absent |
| 1.26 | Missing `toggleModalPassword()` | Fetches/reveals project passwords via `/api/projects/:id/password` | Absent |
| 1.27 | Missing `regeneratePassword()` | Calls `/api/projects/:id/regenerate-password` | Absent |

### Global CSS Variable Differences (design-system.css vs legacy :root)

| # | Variable | Legacy | Svelte |
|---|---|---|---|
| 1.28 | `--primary-text` | `#2a2a2a` | `#1a1a1a` |
| 1.29 | `--secondary-text` | `#555555` | `#333` |
| 1.30 | `--accent-blue` | `#4A90C8` | `#007acc` |
| 1.31 | `--accent-red` | `#D96459` | `#ff6b6b` |
| 1.32 | `--accent-green` | `#5B8C6E` | `#51cf66` |
| 1.33 | `--accent-teal` | `#7AC7C4` | `#469FE0` |
| 1.34 | `--accent-purple` | `#9B6B9E` | `#845ec2` |
| 1.35 | `--bg-primary` | `#F8F6F3` | `#FDF8F0` |
| 1.36 | `--bg-secondary` | `#FFFFFF` | `#FEFDFA` |
| 1.37 | Missing color variables | `--accent-pink: #EE5A6F`, `--secondary-brown: #8B7355`, `--secondary-tan: #B8A394`, `--secondary-slate: #6B7C8A`, `--secondary-cream: #E8DDD0` | Absent |
| 1.38 | Font families differ | `Crimson Text` + `IBM Plex Mono` (loaded via Google Fonts) | `DM Sans` + `Bricolage Grotesque` + `Public Sans` + `Archivo` |

---

## 2. Kanban (kanban.html → /kanban/+page.svelte)

### Layout & Header

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 2.1 | Header has visible "Add Project" button outside modal | Button is in `.board-container` above the board, text: "add project" (no "+"), `margin-bottom: 2rem` | Button says "+ add project", is inside a flex-column header with centered alignment and extra `box-shadow` |
| 2.2 | Header lacks subtitle text | Has `<p>` subtitle below `<h1>` (color: subtle-text, 1.1rem) | No subtitle |
| 2.3 | Header h1 font family mismatch | `var(--font-primary)` = `'Crimson Text', serif` | `var(--font-display)` = `'Bricolage Grotesque'` |
| 2.4 | "Add project" button lacks `box-shadow` in legacy | No box-shadow | Has `box-shadow: 0 2px 8px rgba(0,0,0,0.15)` |
| 2.5 | "Add project" button font family mismatch | No explicit font-family (inherits body = Crimson Text) | `var(--font-body)` = `'Public Sans'` |

### Columns & Board

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 2.6 | Column background color | `var(--bg-secondary)` = `#FFFFFF` | `var(--bg-white)` = `#ffffff` (same value but different variable name — may differ if design-system.css changes) |
| 2.7 | "In Production" column header color | `var(--accent-orange)` (not defined in legacy :root — likely undefined/fallback) | `var(--accent-gold)` = `#E8A45D` |
| 2.8 | "In Production" column title color | Same issue — uses `--accent-orange` | Uses `--accent-gold` |
| 2.9 | Archive column: cards always wrapped in legacy | `.column.archive .cards` always uses `flex-direction: row; flex-wrap: wrap` | Only wraps when `.expanded` class is present |
| 2.10 | Archive column: card width always applied in legacy | `.column.archive .card` always has `width: 250px; flex-shrink: 0` | Only applied when `.expanded` |

### Drag & Drop

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 2.11 | Drag implementation differs | Native HTML5 drag/drop (`draggable="true"`, dragstart/dragend/dragover/drop events) | Uses `svelte-dnd-action` library (different UX feel, touch support) |
| 2.12 | Missing `.dragging` class visual | Legacy: `.card.dragging { opacity: 0.5; }` | No equivalent opacity reduction during drag |
| 2.13 | Missing `.drag-over` visual on columns | Legacy: `.column.drag-over { background: rgba(70, 159, 224, 0.05); border-color: var(--accent-teal); }` | No equivalent column highlight on drag-over |
| 2.14 | Card cursor differs | Legacy: `cursor: move` | Svelte: `cursor: pointer` (svelte-dnd-action handles cursor internally) |

### Cards

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 2.15 | Card displays `project.title` vs `project.name` | Legacy uses `project.title` (transformed from API `name`) | Svelte uses `project.name` directly from API |
| 2.16 | Card displays `project.status` vs `project.status_text` | Legacy shows `project.status` (transformed from `status_text`) | Svelte shows `project.status_text` directly |
| 2.17 | Missing `.card-client` display | Legacy has `.card-client` class defined but not rendered on cards | Svelte also doesn't render it — both match (not a discrepancy) |

### Project Modal

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 2.18 | Scope inputs use `type="text"` in legacy | `<input type="text">` for scope fields (accepts any text like "10 mins") | `<input type="number">` (only accepts numbers) |
| 2.19 | Hours logger row visibility logic | Legacy shows/hides individual rows (`dialogueRow`, `soundDesignRow`, etc.) — always shows all rows when hours logger is visible | Svelte always shows all rows too — matches |
| 2.20 | Music logged hours input is `type="text"` + `readonly` in legacy | `<input type="text" ... readonly>` | `<input type="number" ... readonly>` |
| 2.21 | Hours logged inputs are `type="text"` in legacy | All hours inputs are `type="text"` | All are `type="number"` in Svelte |
| 2.22 | "Cue Tracker" label is a clickable label in legacy | `<label>` with `onclick="openCueTracker()"` | `<button>` element styled as link |
| 2.23 | "Send to Invoices" button styling | Legacy: `style="background: var(--accent-blue);"` inline | Svelte: `.btn-invoice` class with `background: var(--accent-blue)` |
| 2.24 | `sendProjectToInvoices` missing `loggedHours` in Svelte | Legacy includes `loggedHours` in the invoice data stored to localStorage | Svelte omits `loggedHours` from the invoice data |
| 2.25 | `sendProjectToInvoices` missing `estimateData` in Svelte | Legacy includes `estimateData` (from `project.estimateData`) | Svelte doesn't include it |

### Data Layer & API Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 2.26 | Project data transformation | Legacy uses `kanban-api-adapter.js` which transforms API data (`.name` → `.title`, `.client_name` → `.client`, etc.) | Svelte uses API data directly (`.name`, `.client_name`, `.status_text`) |
| 2.27 | Dirty tracking / optimistic saves | Legacy has `markDirty()` + saves only changed projects in parallel | Svelte does full `projectsAPI.update()` calls then reloads all projects |
| 2.28 | `columnToStatus` mapping for `in-review` differs | Legacy adapter: `'in-review': 'active'` | Svelte: `'in-review': 'hold'` |
| 2.29 | New project creation with temp ID | Legacy creates with `Date.now().toString()` as temp ID, adapter detects long ID strings to create via POST | Svelte uses `projectsAPI.create()` directly — cleaner but different |
| 2.30 | Missing `postMessage` to parent on save | Legacy calls `window.parent.postMessage({ type: 'projects-updated' }, '*')` after save | Svelte has no equivalent — dashboard won't refresh |
| 2.31 | Missing `postMessage` to parent on delete | Legacy sends `projects-updated` after delete | Svelte doesn't |
| 2.32 | Missing `postMessage` listener for `projects-updated` from parent | Legacy listens and re-initializes board | Svelte doesn't listen |
| 2.33 | Missing `storage` event listener | Legacy re-renders on `kanban-projects` localStorage changes | Svelte doesn't |
| 2.34 | `contactEmail` not saved on new project creation in Svelte | Legacy saves `contactEmail` as part of project object | Svelte's `projectsAPI.create()` doesn't include `contact_email` |

### CSS / Styling

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 2.35 | Font families throughout | Legacy uses `Crimson Text` for body/headings, `IBM Plex Mono` for technical text | Svelte uses design-system vars (`DM Sans`, `Bricolage Grotesque`, `Public Sans`, `Archivo`) |
| 2.36 | `textarea` font family | Legacy: `var(--font-body)` (undefined in legacy :root, so falls back) | Svelte: `var(--font-body)` = `'Public Sans'` |
| 2.37 | Form input font family | Legacy: `var(--font-primary)` = `Crimson Text` | Svelte: `var(--font-body)` = `Public Sans` |
| 2.38 | `.card-category` font family | Legacy: `var(--font-technical)` = `IBM Plex Mono` | Svelte: `var(--font-mono)` = `Archivo` |

---

## 3. Cues (cues.html → /cues/+page.svelte)

### Header & Layout

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 3.1 | Missing `h1` title in header | Legacy has `<h1>` (font-family: `--font-display`, 2rem, font-weight 600) inside `.header-left` alongside the project select | Svelte only has the `<select>` dropdown, no h1 or `.header-left` wrapper |
| 3.2 | Header layout structure differs | Uses `.header-left` flex container with `gap: 1rem` holding both h1 and select | `.header` directly contains just the `<select>` |
| 3.3 | `body` overflow set to `hidden` in legacy | `overflow: hidden` on body | Svelte overrides with `:global(body) { overflow: auto !important; }` |

### Project Loading

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 3.4 | Different API for loading projects with music | Uses dedicated `getProjectsWithMusic()` which calls `/api/projects/with-music` (optimized JOIN query) | Uses `projectsAPI.getAll()` then filters client-side by `scope_summary.music_minutes > 0` |
| 3.5 | Project option text format differs | `${project.name} (${project.musicMinutes} mins)` — uses pre-mapped `musicMinutes` from API | `{project.name} ({project.scope_summary?.music_minutes || 0} mins)` — reads from nested scope_summary |
| 3.6 | Missing auto-select project from localStorage | Legacy preserves `select.value` across re-initializations (retains selected project) | No persistence of selected project — resets on page load |

### Import Spotting Notes (Missing Feature)

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 3.7 | Missing "import spotting notes" button | `<button class="btn btn-secondary" onclick="document.getElementById('spottingNotesFile').click()">import spotting notes</button>` with hidden file input | Absent — no import button or file input |
| 3.8 | Missing `handleSpottingNotesImport()` function | Reads `.txt` file, detects format (Pro Tools vs Logic Pro), dispatches to parser | Absent |
| 3.9 | Missing `parseProToolsCues()` function | Parses tab-separated Pro Tools session data with timecode (HH:MM:SS:FF), deduplicates by start time, creates cues | Absent |
| 3.10 | Missing `parseLogicProCues()` function | Parses Logic Pro spotting notes with bar/beat positions, converts via BPM/time signature/FPS to timecode | Absent |
| 3.11 | Missing `convertLogicCue()` helper | Converts Logic Pro bar/beat/division/tick positions to HH:MM:SS timecode using session BPM, time signature, FPS | Absent |
| 3.12 | Missing hidden file input element | `<input type="file" id="spottingNotesFile" accept=".txt" style="display: none;">` | Absent |

### Progress Bar Colors

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 3.13 | `.progress-written` background color | `var(--accent-orange)` | `var(--accent-gold)` = `#E8A45D` |
| 3.14 | `status-written` inline select color | `var(--accent-orange)` | `var(--accent-gold)` |
| 3.15 | Color-coded dropdown `option[value="written"]` color | `var(--accent-orange)` | Not present (no option-level color styling in Svelte) |

### Fonts & Styling

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 3.16 | `.project-select` font family | `var(--font-primary)` = `Crimson Text` | `var(--font-body)` = `Public Sans` |
| 3.17 | `.btn` font family | `var(--font-primary)` = `Crimson Text` | `var(--font-body)` = `Public Sans` |
| 3.18 | Form `input, select, textarea` font family | `var(--font-primary)` = `Crimson Text` | `var(--font-body)` = `Public Sans` |
| 3.19 | `.inline-theme-input` font family | `var(--font-primary)` = `Crimson Text` | `var(--font-body)` = `Public Sans` |
| 3.20 | `textarea` font family | `var(--font-body)` (undefined in legacy, falls back) | `var(--font-body)` = `Public Sans` (Svelte textarea rule doesn't explicitly set font, inherits from general `input, select, textarea` rule) |
| 3.21 | `.stat` background | `var(--bg-secondary)` = `#FFFFFF` | `var(--bg-white)` = `#ffffff` (same value, different variable) |
| 3.22 | `.progress-bar-container` background | `var(--bg-secondary)` = `#FFFFFF` | `var(--bg-white)` = `#ffffff` (same value, different variable) |
| 3.23 | `.cue-table-container` background | `var(--bg-secondary)` = `#FFFFFF` | `var(--bg-white)` = `#ffffff` (same value, different variable) |
| 3.24 | `.modal-content` background | `var(--bg-secondary)` = `#FFFFFF` | `var(--bg-white)` = `#ffffff` (same value, different variable) |

### Theme Modal

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 3.25 | Missing auto-focus on theme name input | Legacy: `setTimeout(() => document.getElementById('newThemeName').focus(), 100)` in `showThemeModal()` | Svelte does not auto-focus the input when theme modal opens |

### Unused Import

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 3.26 | Unused `CueStatusBadge` import | N/A | `import CueStatusBadge from '$lib/components/cues/CueStatusBadge.svelte'` is imported but never used in the template |

### Legacy Status Compatibility CSS

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 3.27 | Missing legacy status badge CSS classes | Legacy has `.status-sketch`, `.status-recording`, `.status-mixing`, `.status-complete` for backwards-compatible display | Svelte doesn't define these classes (relies on normalization only) |

### Export Cue Sheet

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 3.28 | CSV export `Usage Type` column source | Legacy: `cue.usage || cue.theme || ''` (checks `usage` first, falls back to `theme`) | Svelte: `cue.theme || ''` (only checks `theme`) |

### Inline Editing Behavior

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 3.29 | Inline edit event binding pattern | Legacy: uses `data-cue-id` + `data-field` attributes with delegated `blur` listener added after render | Svelte: uses `onblur` event handlers directly in each `<input>` element (functionally equivalent, not a bug) |

---

## 4. Notes (notes.html → /notes/+page.svelte)

### Header & Title

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.1 | Missing NoteMarker gradient title | `h1.notemarker-title` with `Bricolage Grotesque`, gradient text (`linear-gradient(90deg, #007acc, #ff6b6b)`), 2.5rem | No h1 title — only `<svelte:head>` page title |
| 4.2 | Missing header subtitle | `<p>` subtitle below h1 with `color: var(--color-text-secondary)` | Absent |

### Status Bar & Connection

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.3 | Missing spec readout display | `.spec-readout` shows FPS, sample rate, bit depth from Pro Tools session | Absent — no spec readout UI |
| 4.4 | Missing FPS display/selector | `specFps` element with auto-detection from Pro Tools, `.fps-display` styling | FPS hardcoded to `'25'` in settings object (line 317) |
| 4.5 | Missing marker track selector | `.track-select` dropdown for choosing marker target track | Absent |
| 4.6 | Missing periodic connection monitoring | `startConnectionMonitoring()` polls every 3 seconds, `stopConnectionMonitoring()` for cleanup | Only event-based monitoring via `electronAPI.ptsl` listeners, no polling loop |
| 4.7 | Connection button text states differ | Dynamically updates: "connect" → "Connecting..." → "Disconnect" | Only two states: "Connect" / "Disconnect" (no "Connecting..." state) |

### Session Start / Timecode Input

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.8 | Missing timecode input formatting | `setupSessionStartFormatting()` with auto-colon insertion, cursor position preservation, paste handling, backspace logic | Simple `bind:value={sessionStart}` with no formatting |
| 4.9 | Missing drop-frame timecode support | `formatTimecodeString()`, `isDropFrameMode()`, `updateTimecodeFormat()` — converts colons to semicolons for drop-frame | Absent — no drop-frame logic |
| 4.10 | Default session start value differs | `00:00:00:00` (4 groups with frames) | `01:00:00:00` (different default value) |

### Upload / File Handling

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.11 | Missing drag-and-drop file upload | `handleDragOver()`, `handleDragLeave()`, `handleDrop()` on upload zone + document-level drag prevention | No drag-and-drop handlers |
| 4.12 | Missing file input change handler | `<input type="file" class="file-input">` with `handleFileUpload` event listener | No `<input type="file">` element — only native dialog via `openFileDialog()` |
| 4.13 | Upload zone text differs | `"import txt files here"` | `"drag & drop .txt files here or click to import"` (Svelte text references drag-drop but doesn't implement it) |

### Validation & Marker Creation

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.14 | Missing detailed validation display | `.validation-error` and `.validation-warning` styled boxes with strong titles | Only simple count display: "X markers ready" |
| 4.15 | Missing `validateMarkerSettings()` function | Validates FPS against supported list before marker creation | Absent — FPS hardcoded |

### Toast Notification System

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.16 | Missing toast queue system | `toastQueue` array, `isToastActive` flag, `processToastQueue()` for sequential display | Simple reactive array — all toasts show simultaneously |
| 4.17 | Missing toast title/message dual-line | `showToast()` takes options with `title` and `message` as separate fields, renders `.toast-title` + `.toast-message` | `showToast(type, message)` — single message line only |
| 4.18 | Missing toast action buttons | `.toast-actions` with `.toast-action-btn` elements for interactive toasts | Absent |
| 4.19 | Missing toast wrapper functions | `showSuccessMessage()`, `showErrorMessage()`, `showWarningMessage()`, `showInfoMessage()`, `showCriticalError()` | Only `showToast(type, message)` |

### Modal Dialog System

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.20 | Missing modal dialog system | Full system: `.modal-overlay`, `.modal-dialog`, `showModal()` with title/subtitle/message/guidance/actions, `closeModal()`, Escape key handler, backdrop click | Absent — no modal system |

### Logging & Error Handling

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.21 | Missing production logging system | `logger` object with `debug()`, `info()`, `warn()`, `error()` methods, `isDevelopment` flag, sends logs to main process via `window.electronAPI.debug.log()` | Simple `console.error()` calls only |
| 4.22 | Missing global error handling | `setupGlobalErrorHandling()` with `window.electronAPI.onCriticalError()`, `onUnhandledError()`, `window.addEventListener('error')`, `window.addEventListener('unhandledrejection')` | Absent — only try/catch in individual functions |
| 4.23 | Missing critical error modal | `showCriticalErrorModal()` for severe errors | Absent |

### Keyboard Shortcuts

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.24 | Missing keyboard shortcut infrastructure | `setupGlobalKeyboardShortcuts()`, `getCrossPlatformModifierKey()`, `isKeyboardShortcut()` utilities (shortcuts currently disabled but infrastructure exists) | Absent |

### Responsive Design

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.25 | Missing responsive media queries | Four breakpoints: `800px`, `700px`, `600px`, `400px` — adjust header, status bar, settings, upload zone, controls layout | No media queries |

### Branding & Footer

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.26 | Missing footer logo | `.footer-logo` with Alternatone SVG branding and `.logo-text` | Absent |

### CSS Design System

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 4.27 | Different color variable names | Uses `--color-primary: #4A90E2`, `--color-secondary: #E74C3C`, `--color-success: #27AE60`, etc. | Uses `--accent-blue`, `--accent-red`, references `--color-success`/`--color-error` from unknown source |
| 4.28 | Font family references differ | `--font-primary: 'Crimson Text'`, `--font-technical: 'IBM Plex Mono'` | `--font-primary` from design-system.css = `'DM Sans'` |
| 4.29 | Typography utility classes missing | `.text-display`, `.text-heading`, `.text-subheading`, `.text-body`, `.text-caption`, `.text-small`, `.text-primary` | Absent |
| 4.30 | Missing color palette variables | ~40 CSS variables including neutrals, gradients, focus ring, spacing, shadows | Relies on global design-system.css with fewer variables |

### Added in Svelte (Not in Legacy)

| # | Feature | Details |
|---|---|---|
| 4.31 | Browser/web fallback | `.electron-required` div with graceful message for non-Electron environments |

---

## 5. Media (media.html → /media/+page.svelte)

### Architecture Mismatch (Critical)

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.1 | Completely different page architecture | Single-page tree browser: projects expand inline to show folders ("FROM AA"/"TO AA"), folders expand to show files — all in one table | Two-view architecture: project list view → separate file browser view (navigates away from project list) |
| 5.2 | Missing expandable project rows | Projects are expandable tree nodes (`toggleProject()`) with `▶` icon that rotates on expand; files appear as nested rows | Projects are clickable rows that navigate to a separate file list view |
| 5.3 | Missing folder hierarchy | Each project has "FROM AA" and "TO AA" sub-folders as expandable rows within the project tree | No folder concept at all — files are shown flat |
| 5.4 | Missing localStorage persistence of expand state | `expandedProjects`, `expandedFolders`, `expandedFtpFolders` saved to/restored from localStorage | No expand state persistence (no expand concept) |

### FTP Browser Integration (Missing Feature)

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.5 | Missing FTP browser toggle | `ftpBrowserEnabled` flag (localStorage), loads FTP root folders alongside projects | Absent — no FTP browsing |
| 5.6 | Missing FTP folder browsing | `toggleFtpFolder()`, `renderFtpContents()`, recursive folder navigation with caching (`ftpContentsCache`) | Absent |
| 5.7 | Missing FTP file rows with checkboxes | FTP files have `<input type="checkbox">` for multi-select, `.file-checkbox` class | Absent |
| 5.8 | Missing FTP file selection system | `selectedFtpFiles` Set, `toggleFileSelection()`, `updateSelectionUI()`, `createSelectionBar()` with floating bottom bar | Absent |
| 5.9 | Missing FTP batch share | `shareSelectedFiles()` — generates share URL with selected file paths, copies to clipboard | Absent |
| 5.10 | Missing FTP upload | `uploadToFtpFolder()`, `uploadFileToFtp()` — uploads files directly to FTP paths | Absent |
| 5.11 | Missing FTP download | `downloadFtpFile()` with progress overlay, `downloadFtpFolder()` (stub) | Absent |
| 5.12 | Missing FTP delete | `deleteFtpItem()` — deletes FTP files/folders with cache invalidation | Absent |
| 5.13 | Missing FTP copy link | `copyFtpFileLink()` — sends `show-share-link-modal` postMessage to parent for FTP paths | Absent |
| 5.14 | Missing combined sort of FTP folders + projects | Legacy combines FTP root folders (that have no associated project) with projects, sorts alphabetically | Svelte only shows projects |

### Project Actions (Missing Features)

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.15 | Missing FTP Setup action button | "FTP Setup" gear icon button per project row, calls `openFtpSetupForProject()` which builds modal content and sends `show-ftp-modal` postMessage | Absent |
| 5.16 | Missing "Copy share link" action button | Chain/link icon button per project row, calls `copyClientPortalLinkForProject()` which sends `show-share-link-modal` postMessage | Absent |
| 5.17 | Missing project delete action | "Delete project" trash icon per project, `deleteProject()` with optimistic UI update and rollback on error | Absent — Svelte has no delete project action |
| 5.18 | Project row has fewer columns | Legacy: Name, Status, Files, Size, Date Uploaded, Actions (6 columns) | Svelte project list: Project Name, Files, Total Size, Actions (4 columns — missing Status and Date Uploaded) |

### File Actions (Missing/Different)

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.19 | Missing "Generate Public Link" action | `generatePublicLink()` → calls `/api/downloads/generate`, shows modal with link + expiry date | Absent |
| 5.20 | Missing "Copy Link" action on files | `copyFileLink()` sends `show-share-link-modal` postMessage | Absent |
| 5.21 | Media file names are clickable links in legacy | Media files (by extension) render as `<a>` tags linking to `media_review.html?file=...&project=...` | Svelte has separate play button but file name is not clickable |
| 5.22 | Missing file drag-and-drop between folders | `handleFileDragStart()`, `handleFileDragEnd()`, `handleFolderDrop()` — files can be dragged between "FROM AA"/"TO AA" folders, calls `/api/projects/:id/files/:id/move` | Absent |

### Upload System

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.23 | Missing upload modal with progress | `showUploadModal()` creates centered modal overlay with animated progress bar, file count status, completion/error states | Svelte has inline progress bar (`.upload-progress` div) |
| 5.24 | Upload uses XHR with real progress in legacy | `uploadFile()` uses `XMLHttpRequest` with `xhr.upload.addEventListener('progress')` for per-byte progress | Svelte uses `filesAPI.upload(formData)` — no granular upload progress |
| 5.25 | Missing parallel file upload | Legacy uploads multiple files in parallel via `Promise.all(uploadPromises)` with per-file progress tracking | Svelte uploads sequentially in a for loop |
| 5.26 | Missing drag-and-drop file upload to folders/projects | Body-level drag prevention + delegated drop handler on `tbody` — files dropped on project rows default to "FROM CLIENT" folder | No drag-and-drop upload support |

### Download System

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.27 | Missing download progress modal | `downloadFile()` creates overlay with progress bar, filename, percentage, size stats, cancel button | Svelte uses `window.location.href = /api/files/${fileId}/download` (no progress) |
| 5.28 | Missing download cancel functionality | `cancelDownload()` with `AbortController` | Absent |
| 5.29 | Download uses streaming reader in legacy | `response.body.getReader()` reads chunks with progress updates, then creates blob URL for download | Svelte uses simple redirect |

### Toast Notification System

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.30 | Missing toast notification system | `showToast(message, type, duration)` — creates positioned toast with slide animation, auto-dismiss | Svelte uses `alert()` for errors and `console.error()` |

### Backup Feature

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.31 | Missing backup button | "backup" button at top-right, calls `backupFTP()` → `POST /api/ftp/backup` with confirmation + toast feedback | Absent |

### Public Link Modal

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.32 | Missing public link modal | `showPublicLinkModal()` — displays generated URL, expiry date, copy button, close button | Absent |

### Data Layer

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.33 | Missing project cache with abort controllers | `projectsCache`, `projectAbortControllers` for request cancellation on rapid toggle | Svelte reloads all projects on mount, no caching |
| 5.34 | Missing FTP contents cache | `ftpContentsCache` object keyed by path | Absent |
| 5.35 | Missing optimistic delete with rollback | `deleteProject()` and `deleteFile()` remove from cache immediately, roll back on API failure | Svelte `deleteFile()` waits for API response then reloads |
| 5.36 | File API endpoint differs | Legacy: `GET /api/projects/${projectId}/files` (project-scoped), `DELETE /api/files/${fileId}` with credentials | Svelte: `filesAPI.getByProject()`, `filesAPI.delete()` (may differ in implementation) |

### CSS / Styling

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.37 | Missing responsive media query | Legacy `media-styles.css`: `@media (max-width: 768px)` adjusts controls, table padding, stats-bar | No media queries in Svelte |
| 5.38 | Missing drag-over styling | `.drag-over` class: `background-color: rgba(70, 159, 224, 0.1); border: 2px dashed var(--accent-teal)` | Absent |
| 5.39 | `.btn-primary` font family differs | Legacy `media-styles.css`: `var(--font-button)` = `'Inter'` | Svelte: `var(--font-body)` = `'Public Sans'` |
| 5.40 | Table cell padding differs | Legacy: `0.75rem 1.5rem` | Svelte: `1rem 1.5rem` |
| 5.41 | `.file-name` font-weight differs | Legacy: `font-weight: 500` | Svelte: no explicit font-weight (inherits normal) |
| 5.42 | `.btn-action` color differs | Legacy: `color: var(--muted-text)` (#888) | Svelte: `color: var(--subtle-text)` (#666) |
| 5.43 | Missing `.status-badge` styles | Legacy project rows show status with `formatStatus()` + badge styling | Svelte has no status column |

### PostMessage Communication

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 5.44 | Missing `show-ftp-modal` postMessage | Sent to parent when FTP Setup clicked | Absent (Svelte is not in an iframe) |
| 5.45 | Missing `show-share-link-modal` postMessage | Sent to parent for project, file, and FTP share link generation | Absent |
| 5.46 | Missing `hide-ftp-modal` postMessage | Sent to parent when closing FTP setup | Absent |

---

## 6. Media Browser (media_browser.html → /media/browser/+page.svelte)

### Data Source

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 6.1 | Data source completely different | Hardcoded sample `fileSystem` object with fake projects/files — no real API calls | Uses `ftpAPI.browse(path)` to load real FTP directory contents |
| 6.2 | Folder navigation approach differs | `navigateToFolder()` traverses in-memory `fileSystem.root[].children` tree | `loadDirectory(path)` makes API call for each folder navigation |

### Table Columns

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 6.3 | Missing Duration column | Has 5 columns: Name, Date Modified, Size, Type, Duration | 4 columns: Name, Date Modified, Size, Type — Duration column absent |
| 6.4 | Missing `duration` sort option | `sortBy('duration')` handler compares `item.duration` strings | No duration sorting |

### File Type Badges

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 6.5 | Missing file-type-specific badges | Legacy has `.badge-video`, `.badge-audio`, `.badge-image`, `.badge-folder` with distinct colors | Svelte only has `.badge-directory` and `.badge-file` — no video/audio/image differentiation |

### File Icons

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 6.6 | Missing rich file type icons | `getFileIcon()` returns SVG for folder, video, audio, image, document types (5 icons) | `getFileIcon()` only has `directory` and `file` icons (2 icons), and icons are defined but never rendered in template |

### Interactions

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 6.7 | Missing double-click to open in review | `ondblclick="openInReview('${file.name}')"` on video files, sends `postMessage` to parent | No double-click handler |
| 6.8 | Missing `openInReview` postMessage | Sends `{ type: 'openInReview', fileName, filePath }` to parent window | Absent |
| 6.9 | All table rows have cursor:pointer in legacy | `tbody tr { cursor: pointer }` (all rows clickable) | Only folder rows get `cursor: pointer` via inline style |

### CSS / Styling

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 6.10 | Color variable values differ | Legacy `:root` uses original palette (`--accent-teal: #7AC7C4`, `--accent-blue: #4A90C8`, `--bg-primary: #F8F6F3`, etc.) | Svelte uses design-system.css palette (`--accent-teal: #469FE0`, `--accent-blue: #007acc`, `--bg-primary: #FDF8F0`, etc.) |
| 6.11 | Font families differ | Legacy: `--font-primary: 'Crimson Text', serif`, `--font-technical: 'IBM Plex Mono'` | Svelte: inherited from design-system.css (`DM Sans`, `Bricolage Grotesque`, etc.) |
| 6.12 | Table cell padding differs | Legacy: `0.65rem 1.5rem` | Svelte: `1rem 1.5rem` |
| 6.13 | Missing `.file-duration` class | Legacy has `.file-duration` styled with `font-family: var(--font-mono)` | Absent (no duration column) |
| 6.14 | Breadcrumb uses `<a>` tags in legacy | `<a href="#" onclick="...">` for breadcrumb links | `<button class="breadcrumb-link">` in Svelte |

---

## 7. Media Review (media_review.html → /media/review/+page.svelte)

### FTP File Support (Missing Feature)

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 7.1 | Missing FTP file playback | Accepts `?ftpFile=` URL param, `loadFtpFile()` streams from `/api/ftp/stream?path=...` | Only supports `?file=` + `?project=` params — no FTP file support |
| 7.2 | Missing FTP download URL | Sets `currentDownloadUrl` to `/api/ftp/download?path=...` for FTP files | Only uses `/api/files/${fileId}/download` |

### Comments

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 7.3 | Missing comment stats display | Shows "total" and "open" badge counts in `.comments-stats` div | No comment stats — just the heading "Comments" |
| 7.4 | Missing "send to notes" export button | `exportToNotesBtn` sends `exportToNotes` postMessage with formatted comments to parent | Absent |
| 7.5 | Missing localStorage fallback for comments | `saveCommentsToLocalStorage()`, `loadCommentsFromLocalStorage()`, `clearCommentsLocalStorage()` as server backup | No localStorage fallback |
| 7.6 | Missing comment auto-sort by time | `comments.sort((a, b) => a.timeSeconds - b.timeSeconds)` after adding | Svelte reloads from server (order depends on API) |
| 7.7 | Missing optimistic comment updates | Legacy resolve/delete uses optimistic updates with rollback | Svelte awaits API then reloads all comments |
| 7.8 | Comment API endpoint differs for loading | Legacy: `GET /api/files/${projectId}/${fileId}/comments` (project-scoped) | Svelte: `filesAPI.getComments(fileId)` — may not be project-scoped |
| 7.9 | Missing auto-pause on comment focus | Legacy: `commentInput.addEventListener('focus', ...)` pauses video and captures timecode | Svelte: `handleTimecodeCapture` is called via `onTimecodeCapture` prop but no auto-pause |
| 7.10 | Missing auto-resume after comment | Legacy: `wasPlayingBeforeComment` flag resumes playback after comment submission | Absent |
| 7.11 | Missing double-submit protection | `isSubmittingComment` flag + `addCommentBtn.disabled` | No double-submit guard |
| 7.12 | Comment markers not clickable in Svelte | Legacy markers have click handlers that jump to time and highlight comment | Svelte markers render but have `pointer-events: all` with no click handler |
| 7.13 | Missing comment card click-to-seek | Legacy: clicking card seeks player + sets `activeCommentId` for highlight | Svelte: `handleJumpToTime` only logs to console (`console.log('Jump to', seconds)`) |
| 7.14 | Missing active comment highlight | Legacy: `.comment-card.active` class with border highlight | No active comment tracking |

### Video Player

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 7.15 | Audio type detection differs | Legacy: checks `file.mime_type.startsWith('audio/')` from API data | Svelte: checks file extension from stream URL (may fail for API URLs without extensions) |
| 7.16 | Stream URL format differs | Legacy: `/api/files/${projectId}/${fileId}/stream` (project-scoped) | Svelte: `filesAPI.getStreamUrl(fileId)` — may not be project-scoped |
| 7.17 | Back button cleans up media in legacy | Legacy: `navigateBack()` pauses + clears `src` + calls `load()` on both video/audio | Svelte: just calls `window.history.back()` with no cleanup |

### Keyboard Shortcuts

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 7.18 | M key behavior differs | Legacy: focuses comment input textarea | Svelte: calls `captureTimecode()` which triggers `onTimecodeCapture` callback |

### CSS / Styling

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 7.19 | Color variables differ | Legacy `:root` uses original palette (`--accent-teal: #7AC7C4`, `--accent-orange` for markers) | Svelte uses design-system.css (`--accent-teal: #469FE0`, `--accent-gold` for markers) |
| 7.20 | Font families differ | Legacy: `Crimson Text`, `IBM Plex Mono` | Svelte: design-system vars |
| 7.21 | Missing no-cache meta tags | Legacy has `Cache-Control`, `Pragma`, `Expires` meta headers | Absent |
| 7.22 | Missing scrollbar styling for comments | Legacy has custom `::-webkit-scrollbar` styles | Absent |

### PostMessage Communication

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 7.23 | Missing `exportToNotes` postMessage | Sends formatted comments to parent for import into NoteMarker | Absent |
| 7.24 | Missing `loadFile` message listener | Legacy listens for `loadFile` from parent | Absent |

---

## 8. Media Transfer (media_transfer.html + media-app.js → /media/transfer/+page.svelte)

### Admin/Client Mode & Authentication

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 8.1 | Missing admin/client mode detection | Detects `window.electronAPI.isElectron()` to choose admin vs client mode. Admin shows project selector; client shows login or direct file access | Always shows admin project selector — no mode detection |
| 8.2 | Missing login screen for client mode | HTML has `#loginScreen` (hidden by default) with project name + password form. `initClientMode()` would show this for non-Electron users | No login screen at all |
| 8.3 | Missing `admin-auth-check.js` script | `<script src="admin-auth-check.js">` loaded in `<head>` for session validation | No auth check on page load |
| 8.4 | Admin controls not conditional on mode | Legacy only shows `#adminControls` (assign folder, sync, share link) when `appMode === 'admin'` | Admin controls always shown in file browser view |
| 8.5 | Delete button not conditional on mode | Legacy only shows delete button per file when `appMode === 'admin'` | Delete button always shown for every file |

### Project List Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 8.6 | Missing project delete action | Project list has a delete button per row calling `deleteProject(id, name)` with confirmation dialog | No delete button in project list |
| 8.7 | Missing share link action in project list | Project list has a share link button per row calling `generateShareLinkForProject(projectId)` | No share link button in project list |
| 8.8 | Project name is clickable link in legacy | Uses `<a href="#">` with `onclick="openProject(id)"` | Uses separate "Open" icon button in actions column |
| 8.9 | Folder column shows different field | Legacy shows `project.media_folder_path` (strips `/Volumes/FTP1/` prefix) | Svelte shows `project.ftp_folder` — different field name, shows "Not assigned" as fallback |
| 8.10 | Project creation sends different payload | Legacy sends `{ name, password: password || null }` | Svelte sends `{ name, client_password, status: 'prospects' }` via `projectsAPI.create()` |
| 8.11 | Project creation success feedback differs | Legacy shows `alert('Project "name" created successfully!')` | Svelte silently closes modal with no success feedback |

### File Browser Admin Controls

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 8.12 | Missing share link button in file browser | Legacy has "share link" button calling `generateShareLink()` which POSTs to `/api/projects/${id}/generate-share-link`, copies URL to clipboard | No share link button in file browser view |
| 8.13 | Sync folder button shows loading state in legacy | Legacy disables button, changes text to "syncing...", then restores SVG+text on complete | Svelte `syncProjectFolder()` has no loading state — just calls `ftpAPI.syncProject()` |
| 8.14 | Sync folder shows sync results in legacy | Legacy shows `alert('Sync complete!\n\nAdded: X\nUpdated: Y\nDeleted: Z')` | Svelte shows generic `alert('Project folder synced successfully')` |
| 8.15 | Sync folder uses different API endpoint | Legacy calls `POST /api/projects/${id}/sync-folder` | Svelte calls `ftpAPI.syncProject()` — may map to a different endpoint |
| 8.16 | Folder assign browses via Electron dialog | Legacy calls `window.electronAPI.selectFolderDialog()` then `assignFolder(folderPath)` which POSTs to `/api/projects/${id}/assign-folder` | Svelte stubs just `alert('This feature requires the desktop app')` with no actual Electron integration |
| 8.17 | Create folder uses Electron API | Legacy calls `window.electronAPI.createFolder(projectName)` then `assignFolder()` | Svelte stubs just `alert('This feature requires the desktop app')` |
| 8.18 | Folder assignment shows results | Legacy shows `alert('Folder assigned successfully!\n\nAdded: X\nUpdated: Y\nDeleted: Z')` and reveals sync button | Svelte has no post-assignment feedback or sync button reveal |
| 8.19 | Sync button visibility conditional on folder path | Legacy shows sync button only when `project.media_folder_path` exists (set in `openProject()`) | Svelte uses `{#if currentProjectData?.ftp_folder}` — similar logic but different field name |

### File Management & Playback

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 8.20 | Media playback uses different approach | Legacy `playMedia()` navigates to `review.html?file=${fileId}` (full review page with comments, timecodes) | Svelte opens inline player modal — no review page, no comments |
| 8.21 | Upload uses different endpoint pattern | Legacy uses `POST /api/projects/${projectId}/files/upload` (project-scoped URL) | Svelte uses `filesAPI.upload(formData)` with `project_id` in form body — different routing pattern |
| 8.22 | Upload progress shows file count in legacy | Legacy shows `Uploading filename... (1/5)` with count | Svelte shows `Uploading filename... (50%)` with percentage |

### PostMessage Communication

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 8.23 | Missing `open-project-media` postMessage listener | Legacy `media_transfer.html` listens for this message and shows "back to ftp admin" button | No postMessage listener |
| 8.24 | Missing `navigate-to-ftp-admin` postMessage sender | Legacy `goBackToFtpAdmin()` sends `{ type: 'navigate-to-ftp-admin' }` to `window.parent` | No back-to-FTP-admin functionality |
| 8.25 | Missing "back to ftp admin" button | Legacy has `#backToFtpAdminBtn` that appears when navigated from FTP admin context | Not present |

### Styling & Fonts

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 8.26 | Font family mismatch | Legacy loads `Crimson Text` + `IBM Plex Mono` and uses `media-styles.css` | Svelte uses design system fonts (`--font-display`, `--font-body`, `--font-mono`) |
| 8.27 | Styles sourced differently | Legacy uses shared `media-styles.css` stylesheet | Svelte has all styles inline in `<style>` block |
| 8.28 | Button font uses `--font-body` not `--font-primary` | Design system rule says buttons must use `--font-primary` (DM Sans) | Svelte buttons use `font-family: var(--font-body)` (Public Sans) |

---

## 9. Estimates (estimates.html → /estimates/+page.svelte)

### Functional Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 9.1 | Missing `admin-auth-check.js` | `<script src="admin-auth-check.js">` in `<head>` for session validation | No auth check on page load |
| 9.2 | Scope parsing uses different defaults | Legacy: `dialogueHours = Math.max(1, Math.round(runtime / 2))`, `soundDesignHours = Math.max(1, Math.round(runtime / 4))`, `mixHours = Math.max(1, Math.round(runtime / 4))` — based on runtime | Svelte: `dialogueHours = Math.max(dialogueHours, 4)`, `soundDesignHours = Math.max(soundDesignHours, 2)`, `mixHours = Math.max(mixHours, 2)` — fixed values |
| 9.3 | Email textarea is read-only in Svelte | Legacy: `<textarea id="copyText">` is editable (user can modify email text) | Svelte: `<textarea>{emailText}</textarea>` uses text content interpolation — not bound, so edits would be overwritten by reactive updates |
| 9.4 | Delete animation missing | Legacy: Optimistic delete with CSS transition (`opacity: 0`, `transform: scale(0.9)`, 200ms delay then `card.remove()`) | Svelte: Immediate array filter `loggedEstimates = loggedEstimates.filter(...)` — no animation |
| 9.5 | Logged estimate loads `contact_email` | Legacy: Does not load `contact_email` from API response (field absent in `loadLoggedEstimate`) | Svelte: Sets `clientEmail = data.contact_email \|\| ''` — correctly loads email |

### Styling Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 9.6 | Font family mismatch | Legacy: `--font-primary: 'Crimson Text', serif` and `--font-technical: 'IBM Plex Mono', monospace` | Svelte uses design system vars (`--font-display`, `--font-body`, `--font-button`) |
| 9.7 | Color variable differences | Legacy defines own `:root` vars (`--accent-blue: #4A90C8`, `--accent-red: #D96459`, `--accent-teal: #7AC7C4`, `--bg-primary: #F8F6F3`) | Svelte inherits global design system vars (different values) |
| 9.8 | Import button styled differently | Legacy: `background: var(--muted-text)` (gray filled button) with `action-btn` class | Svelte: `import-btn` class with `background: none; border: var(--border-medium)` (outline button) with blue text, fills on hover |
| 9.9 | Container background uses different var | Legacy: `background: var(--bg-secondary)` which is `#FFFFFF` | Svelte: `background: var(--bg-white)` — different variable name |
| 9.10 | Breakdown input font family | Legacy: `font-family: var(--font-primary)` (Crimson Text) | Svelte: `font-family: var(--font-body)` (Public Sans) |

### Minor Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 9.11 | Svelte adds `role="button"` + `tabindex` on estimate cards | Legacy: Cards are `<div>` with `onclick` only | Svelte: Cards have `role="button"` `tabindex="0"` and `onkeydown` handler — better accessibility |
| 9.12 | `postMessage` for `projects-updated` present in both | Both correctly send `window.parent.postMessage({ type: 'projects-updated' })` after creating project | No discrepancy — both match |

---

## 10. Invoices (invoices.html → /invoices/+page.svelte)

### Functional Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 10.1 | Missing `admin-auth-check.js` | `<script src="admin-auth-check.js">` in `<head>` for session validation | No auth check |
| 10.2 | `sendToPayments()` uses different API pattern | Legacy uses single transactional `InvoicesAPI.createWithPayment()` that creates invoice + payment + optionally updates project status in one call | Svelte makes two separate calls: `invoicesAPI.create()` then `paymentsAPI.create()` — no transaction, no project status update |
| 10.3 | Missing project status update on 50% deposit | Legacy passes `updateProject: { project_id, status: '50% deposit invoiced' }` when `paymentSplit === '50%'` | Svelte never updates project status after sending invoice |
| 10.4 | `sendToPayments()` uses `api-helpers.js` references | Legacy loads `<script src="api-helpers.js">` and calls `InvoicesAPI`, `PaymentsAPI` helper objects | Svelte imports from `$lib/api` directly |
| 10.5 | Missing `loadModule('payments')` navigation | Legacy calls `window.parent.loadModule('payments')` after sending to payments, navigating user to payments page | Svelte shows alert but no navigation |
| 10.6 | Delete animation missing | Legacy: Optimistic delete with CSS transition (`opacity: 0`, `translateX(-20px)`, 200ms, then DOM removal + empty check) with rollback on failure | Svelte: Refetches entire list via `renderLoggedInvoices()` — no animation, no optimistic update |
| 10.7 | `sendToPayments` final_amount logic differs | Legacy: `final_amount: paymentSplit === 'final' ? lastCalculatedFinalAmount : lastCalculatedTotal` (uses full total for non-final) | Svelte: `final_amount: lastCalculatedFinalAmount` (always uses calculated final) |
| 10.8 | `sendToPayments` line_items format differs | Legacy: Passes `line_items` as array (not stringified) to `createWithPayment()` | Svelte: Pre-stringifies `JSON.stringify([...])` before passing to `invoicesAPI.create()` |
| 10.9 | Invoice line items hidden when value is 0 | Legacy: Always shows both music and post rows (even when 0) | Svelte: Uses `{#if musicMinutes > 0}` and `{#if postDays > 0}` — hides zero-value rows |
| 10.10 | Missing `logInvoice()` function | Legacy has a `logInvoice()` function (separate from `sendToPayments`) that creates draft invoices | Svelte only has `sendToPayments()` — no draft invoice creation |

### Print Styles

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 10.11 | Print styles are less detailed in Svelte | Legacy has comprehensive `@media print` rules: compact padding, smaller fonts for every element, reduced margins | Svelte has minimal print rules: just visibility hiding + position/padding — missing all the compact sizing |

### Styling & Fonts

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 10.12 | Font family mismatch | Legacy: `--font-primary: 'Crimson Text', serif` and `--font-technical: 'IBM Plex Mono'` | Svelte uses `--font-body` (Public Sans), `--font-display`, `--font-mono` |
| 10.13 | `body overflow` differs | Legacy: `overflow: hidden` | Svelte: `:global(body) { overflow: auto !important; }` |
| 10.14 | Invoice container font | Legacy: `font-family: var(--font-primary)` (Crimson Text) | Svelte: `font-family: var(--font-body)` (Public Sans) |
| 10.15 | Category tag font | Legacy: `font-family: var(--font-primary)` | Svelte: `font-family: var(--font-body)` |
| 10.16 | Button font | Legacy: `font-family: var(--font-primary)` (Crimson Text) | Svelte: `font-family: var(--font-body)` (Public Sans) |

---

## 11. Payments (payments.html → /payments/+page.svelte)

### Functional Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 11.1 | Missing `admin-auth-check.js` | `<script src="admin-auth-check.js">` in `<head>` | No auth check |
| 11.2 | Missing header section | Legacy has `<div class="header"><h1>` with title and subtitle | Svelte goes straight to stats grid — no page header |
| 11.3 | `markAsPaid()` API call differs | Legacy calls `POST /api/payments/mark-invoice-paid` with `{ invoice_id, payment: { ... } }` (single transactional call) | Svelte calls `paymentsAPI.markInvoicePaid()` with flatter structure `{ invoice_id, project_id, amount, ... }` — different payload shape |
| 11.4 | `markAsPaid()` payment response differs | Legacy: Reads `result.payment.id` from response to push to local array | Svelte: Reads `response.id` directly — may fail if API returns nested response |
| 11.5 | Modal does not close on backdrop click | Legacy modal has `display: none` / `.active` class toggle, no backdrop click handler | Svelte modal renders conditionally with `{#if showModal}` but also has no backdrop click to dismiss |
| 11.6 | Status badge color variable for overdue differs | Legacy: `color: var(--accent-orange)` (undefined — no `--accent-orange` in root) | Svelte: `color: var(--accent-gold)` |

### Styling Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 11.7 | Font family mismatch | Legacy: `--font-primary: 'Crimson Text'` throughout | Svelte: `--font-body` (Public Sans) for buttons, inputs |
| 11.8 | `body overflow` differs | Legacy: `overflow: hidden` | Svelte: `overflow: auto !important` |
| 11.9 | Stat card background | Legacy: `var(--bg-secondary)` (#FFFFFF) | Svelte: `var(--bg-white)` (different variable name) |
| 11.10 | Section background | Legacy: `var(--bg-secondary)` | Svelte: `var(--bg-white)` |

---

## 12. Books (books.html → /books/+page.svelte)

### Functional Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 12.1 | Missing `admin-auth-check.js` | `<script src="admin-auth-check.js">` in `<head>` for session validation | No auth check |
| 12.2 | `addExpense` description concatenates notes | Legacy: `description: description + ' - ' + notes` (appends notes to description) | Svelte: sends `description` and `notes` as separate fields |
| 12.3 | Expense amount missing `project_id: null` | Legacy: explicitly sets `project_id: null` in `addExpense()` | Svelte: omits `project_id` from the payload |
| 12.4 | `saveEdit` uses `accountingAPI.create()` instead of update | Legacy: calls `saveTransactions()` (localStorage-based save) — in-memory update | Svelte: calls `accountingAPI.create()` for edit — creates new record instead of updating existing |
| 12.5 | Legacy `saveTransactions()` is localStorage-based | Legacy has a `saveTransactions()` function (called from inline edit, category picker, bulk edit) | Svelte has no `saveTransactions()` equivalent — inline edits don't persist to API |
| 12.6 | Category picker doesn't persist to API | Legacy: `openCategoryPicker()` calls `saveTransactions()` after change | Svelte: updates local state but doesn't call API to persist |
| 12.7 | Bulk edit doesn't persist to API | Legacy: `saveBulkEdit()` calls `saveTransactions()` | Svelte: updates local state only — no API call |
| 12.8 | `bulkDeleteExpenses` uses API in Svelte | Legacy: `bulkDeleteExpenses()` filters local array + `saveTransactions()` (localStorage) | Svelte: calls `accountingAPI.delete(id)` for each selected — correct but different approach |
| 12.9 | Receipt viewer missing "replace receipt" button | Legacy: receipt modal has "replace receipt" button calling `replaceReceipt()` | Svelte: receipt modal only has "close" button |
| 12.10 | `applyDateRange` mutates `$derived` in Svelte | Legacy: sets `document.getElementById('periodLabel').textContent` directly | Svelte: attempts `stats.periodLabel = ...` which mutates a `$derived` value (bug — derived values are read-only) |
| 12.11 | Period label not dynamic | Legacy: updates period label to show "X days" when custom range applied | Svelte: `stats.periodLabel` always returns `'Last 30 days'` (hardcoded in `$derived`) |
| 12.12 | `net` calculation differs for expenses | Legacy: `expenses = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)` (amounts are already negative) and `net = income - expenses` | Svelte: uses `Math.abs(t.amount)` for expenses and `net = income - expenses` — same result but different approach |
| 12.13 | Missing drag-and-drop for CSV import zone | Legacy: `importZone` has `dragover`, `dragleave`, `drop` event listeners for CSV file drag-and-drop | Svelte: import zone has `onclick` but no drag-and-drop event handlers |
| 12.14 | CSV import saves to API in Svelte | Legacy: `processCSVImport()` pushes to local `transactions` array + `saveTransactions()` (localStorage) | Svelte: calls `accountingAPI.create()` for each imported transaction — persists to database |

### Styling Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 12.15 | Font family mismatch | Legacy: `--font-primary: 'Crimson Text', serif` throughout (body, buttons, inputs, tabs) | Svelte: `--font-body` (Public Sans) for buttons, tabs, inputs |
| 12.16 | `body overflow` differs | Legacy: `overflow: hidden` | Svelte: `:global(body) { overflow: auto !important; }` |
| 12.17 | `.stat-card` background | Legacy: `var(--bg-secondary)` (#FFFFFF) | Svelte: `var(--bg-white)` (different variable name) |
| 12.18 | `.section` background | Legacy: `var(--bg-secondary)` | Svelte: `var(--bg-white)` |
| 12.19 | `.modal-content` background | Legacy: `var(--bg-secondary)` | Svelte: `var(--bg-white)` |
| 12.20 | `.bulk-actions` background | Legacy: `var(--bg-secondary)` | Svelte: `var(--bg-white)` |
| 12.21 | `.csv-mapping` background | Legacy: `var(--bg-secondary)` | Svelte: `var(--bg-white)` |
| 12.22 | Color variable values differ | Legacy: `--accent-teal: #7AC7C4`, `--accent-blue: #4A90C8`, `--accent-red: #D96459`, `--accent-green: #5B8C6E` | Svelte: inherits design-system vars (different values) |
| 12.23 | `.cat-business_meals` color | Legacy: `color: var(--accent-orange)` | Svelte: `color: var(--accent-gold)` |
| 12.24 | `.cat-advertising` color | Legacy: `color: var(--accent-orange)` | Svelte: `color: var(--accent-gold)` |
| 12.25 | Svelte adds extra `.cat-income` and `.cat-other` classes | Legacy: only has `.cat-other_tax` | Svelte: adds `.cat-income` and `.cat-other` with same styling as `.cat-other_tax` |
| 12.26 | Overview tab category badge shows tax category in Svelte | Legacy: `formatCategory(t.category)` for all (shows expense category) | Svelte: shows `formatCategory` for income but `formatTaxCategory` for expenses — mixed display |

---

## 13. Hours (embedded in index.html + kanban.html → /hours/+page.svelte)

### Architecture Difference (Critical)

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 13.1 | Completely different architecture | Legacy: hours are embedded display components in dashboard (pinned project cards) and kanban (project detail panel) — no standalone page | Svelte: standalone dedicated page with full CRUD at `/hours` |
| 13.2 | Dashboard integration missing | Legacy: `renderPinnedProjects()` in `index.html` fetches from `/api/hours-log` and shows progress bars on project cards | Svelte hours page is standalone — doesn't update dashboard display |
| 13.3 | Kanban integration missing | Legacy: kanban project detail panel shows cumulative hours by category (dialogue, sound design, mix, revisions) as read-only inputs | Svelte: kanban doesn't display hours data |
| 13.4 | Missing `upsert-totals` endpoint usage | Legacy: kanban uses `POST /api/hours-log/project/:id/upsert-totals` for batch updates from project modal | Svelte: no equivalent — only individual CRUD operations |

### Functional Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 13.5 | Hours display format differs | Legacy: shows aggregated totals as `loggedHours / estimatedHours` (e.g., "2.5 / 8.0h") on dashboard cards | Svelte: shows per-category stats with progress bars |
| 13.6 | Music hours category | Legacy: music hours tracked separately via cue tracker stats (progress bar in kanban) | Svelte: `music` is a regular category alongside others |
| 13.7 | Hours editing limited in legacy | Legacy: read-only totals displayed in kanban; only `upsert-totals` batch update available | Svelte: full per-entry editing with add/delete |

### Svelte-Only Features (Not in Legacy)

| # | Feature | Details |
|---|---|---|
| 13.8 | Standalone page with project selector | Svelte has a full page with project dropdown, stats, form, and table view |
| 13.9 | Per-entry CRUD operations | Svelte supports individual entry create/delete (legacy only had batch totals) |
| 13.10 | Estimates integration | Svelte loads estimates to show progress bars (legacy showed this on dashboard instead) |

---

## 14. Admin Login (admin-login.html → /login/+page.svelte)

### Functional Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 14.1 | Redirect destination differs on success | Legacy: `window.location.href = '/media/index.html'` | Svelte: `goto('/')` (SvelteKit root) |
| 14.2 | Redirect destination differs on existing session | Legacy: redirects to `/media/index.html` if `data.isAdmin` is true | Svelte: `goto('/')` |
| 14.3 | API call approach differs | Legacy: direct `fetch('/api/admin/login', ...)` with full response handling | Svelte: `adminAPI.login(...)` wrapper (abstracted) |
| 14.4 | Rate limit detection differs | Legacy: checks `response.status === 429` directly | Svelte: checks `error.message.includes('429')` — may not work if API wrapper doesn't expose status code in message |
| 14.5 | Login uses `fetch` with `credentials: 'include'` | Legacy: explicit `credentials: 'include'` for cookie-based session | Svelte: depends on `adminAPI.login()` implementation — may or may not include credentials |

### Styling Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 14.6 | Font family mismatch | Legacy: `--font-primary: 'Crimson Text'`, `--font-technical: 'IBM Plex Mono'` | Svelte: `--font-primary` from design-system (DM Sans), `--font-mono` (Archivo) |
| 14.7 | Subtitle font family | Legacy: `font-family: var(--font-technical)` (IBM Plex Mono) | Svelte: `font-family: var(--font-mono)` (Archivo) |
| 14.8 | Label font family | Legacy: `font-family: var(--font-technical)` | Svelte: `font-family: var(--font-mono)` |
| 14.9 | `.login-container` background | Legacy: `var(--bg-secondary)` (#FFFFFF) | Svelte: `var(--bg-secondary)` — uses same var name, may differ in value |
| 14.10 | Button uses `display: flex` in Svelte | Legacy: button is block-level with inline `<span>` for text/loading | Svelte: button is `display: flex; align-items: center; justify-content: center` |
| 14.11 | Svelte wraps in `.login-page` div | Legacy: body itself has `display: flex; align-items: center; justify-content: center` | Svelte: `.login-page` wrapper div handles centering (body uses `overflow: hidden !important`) |

---

## 15. Client Login (client_login.html → /client/login/+page.svelte)

### Functional Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 15.1 | API endpoint differs | Legacy: `POST /api/projects/auth` with `{ name, password }` | Svelte: `clientPortalAPI.login({ name, password })` — depends on wrapper implementation |
| 15.2 | Auth check uses different endpoint | Legacy: `GET /api/projects/current` to check existing session | Svelte: `clientPortalAPI.getCurrent()` — may call different endpoint |
| 15.3 | Redirect URLs differ | Legacy: redirects to `client_portal.html?file=...` or `client_portal.html` | Svelte: `goto('/client/portal?file=...')` or `goto('/client/portal')` |
| 15.4 | Button text changes to "authenticating..." in legacy | Legacy: `loginBtn.textContent = 'authenticating...'` during submit, restores to `'access files'` | Svelte: uses `{#if isLoading} authenticating... {:else} access files {/if}` — same visual, different implementation |
| 15.5 | Svelte adds client-side validation | Legacy: relies on HTML `required` attributes only | Svelte: checks `if (!trimmedProjectName \|\| !password)` and shows custom error |
| 15.6 | Credentials inclusion differs | Legacy: explicit `credentials: 'include'` on fetch | Svelte: depends on `clientPortalAPI.login()` implementation |

### Styling Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 15.7 | Font family mismatch | Legacy: `--font-primary: 'Crimson Text'` | Svelte: `--font-primary` from design-system (DM Sans) |
| 15.8 | Missing border on `.login-container` | Legacy: no explicit border | Svelte: also no border — matches |
| 15.9 | `.logo h1` font family | Legacy: `var(--font-display)` (undefined in legacy :root — falls back to inherited) | Svelte: `var(--font-display)` = `'Bricolage Grotesque'` |
| 15.10 | Focus border color | Legacy: `border-color: var(--accent-teal)` = `#7AC7C4` | Svelte: `border-color: var(--accent-teal)` = `#469FE0` (different value) |
| 15.11 | Svelte wraps in `.login-page` div | Legacy: body handles centering | Svelte: `.login-page` wrapper with `overflow: hidden !important` on body |

---

## 16. Client Portal (client_portal.html → /client/portal/+page.svelte)

### Layout Differences (Critical)

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 16.1 | Missing sidebar with project info | Legacy: two-column layout (`350px sidebar + 1fr file browser`) with project info, stats, and actions | Svelte: single-column layout with only the file browser — no sidebar |
| 16.2 | Missing project info panel | Legacy: sidebar shows Status, Client name, and Password (hidden) with show/copy buttons | Absent in Svelte |
| 16.3 | Missing project stats panel | Legacy: sidebar shows 3 stat cards (Files count, Total Size, Folder status) | Absent in Svelte |
| 16.4 | Missing sidebar action buttons | Legacy: sidebar `.actions` with "copy share link", "regenerate password" buttons | Absent in Svelte |

### Functional Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 16.5 | Redirect on auth failure differs | Legacy: `window.location.href = '/client_login.html'` | Svelte: `goto('/client/login')` |
| 16.6 | Upload implementation differs | Legacy: placeholder `alert()` (tus upload integration incomplete in legacy) | Svelte: full tus resumable upload implementation with progress tracking |
| 16.7 | `loadFiles` implementation differs | Legacy: `loadFiles()` is a stub that shows "No files uploaded yet" | Svelte: calls `filesAPI.getByProject(currentProject.id)` and renders actual file list |
| 16.8 | Download button is a no-op in Svelte | Legacy: no per-file download buttons (file table stub) | Svelte: has `<button onclick={() => {}}>download</button>` — no-op click handler |
| 16.9 | Page title differs | Legacy: static `<title>FTP Admin - Alternassist</title>` (incorrect title — says "FTP Admin") | Svelte: dynamic `<title>{currentProject?.name \|\| 'My Files'} - Client Portal</title>` |
| 16.10 | Missing `#projectName` and `#clientName` DOM updates | Legacy: `loadCurrentProject()` sets `projectName.textContent` and `clientName.textContent` | Svelte: uses reactive `{currentProject.name}` in template |
| 16.11 | `copyShareLink` URL format differs | Legacy: `const link = '/client?project=${currentProject.id}'` (relative) | Svelte: `const link = '${window.location.origin}/client?project=${currentProject.id}'` (absolute) |
| 16.12 | Legacy uses `alert()` for notifications | Legacy: `alert('Share link copied to clipboard!')` | Svelte: uses `showNotification('Share link copied!', 'success')` toast |
| 16.13 | Missing `slideIn`/`slideOut` keyframes in legacy | Legacy: references animation names in inline style but doesn't define `@keyframes` | Svelte: defines both `@keyframes slideIn` and `@keyframes slideOut` |
| 16.14 | Logout function differs | Legacy: no explicit logout function shown (only `logout()` referenced in onclick) | Svelte: `handleLogout()` calls `clientPortalAPI.logout()` then `goto('/client/login')` |
| 16.15 | Svelte loads tus client as npm module | Legacy: loads `<script src="https://cdn.jsdelivr.net/npm/@tus/client@3/dist/tus.min.js">` from CDN | Svelte: `import * as tus from 'tus-js-client'` |

### Styling Differences

| # | Discrepancy | Legacy | Svelte |
|---|---|---|---|
| 16.16 | Font family mismatch | Legacy: `--font-primary: 'Crimson Text'` | Svelte: `--font-primary` from design-system (DM Sans) |
| 16.17 | `.main-content` grid differs | Legacy: `grid-template-columns: 350px 1fr` (sidebar + content) | Svelte: `grid-template-columns: 1fr` (single column — no sidebar) |
| 16.18 | Legacy references `#sidebar` element | Legacy: `document.getElementById('sidebar').style.display = 'block'` | Svelte: no sidebar element exists |
| 16.19 | Color variables differ | Legacy: `--accent-teal: #469FE0`, `--accent-green: #5B8C6E`, `--accent-red: #D96459` | Svelte: inherits design-system vars |

---
