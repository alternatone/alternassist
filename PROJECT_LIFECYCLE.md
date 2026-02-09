# Alternassist Project Lifecycle

## Overview

Alternassist manages creative projects (music composition & post-production audio) through a 5-stage kanban workflow with integrated accounting, file management, and client collaboration.

---

## Stage Flow

```
╔══════════════════════════════════════════════════════════════════════╗
║                        PROJECT CREATION                             ║
║  Admin creates project on Kanban board                              ║
║  → Name, client, contact email                                      ║
║  → Auto-generates password + FTP folder (TO AA / FROM AA)           ║
╚══════════════════════════════╤═══════════════════════════════════════╝
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  1. PROSPECTS  (status: "prospects")                                 │
│                                                                      │
│  What happens here:                                                  │
│  • Define project scope (music duration, dialogue/sound/mix hours)   │
│  • Set creative direction notes                                      │
│  • Generate cost estimate → Estimates module                         │
│  • Can pin to dashboard for quick overview                           │
│  • Generate share link for client                                    │
│                                                                      │
│  Accounting: Estimate created (TRT × rate + post hours × rate)       │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ Work begins
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  2. IN PRODUCTION  (status: "active")                                │
│                                                                      │
│  What happens here:                                                  │
│  • Cue Tracker: Write/track music cues                               │
│    Cue statuses: to-write → written → revisions → approved           │
│  • Hours Logger: Track dialogue, sound design, mix, revision hours   │
│  • Music hours auto-calculated from approved cue durations           │
│  • Files uploaded to FTP (FROM AA folder for deliverables)           │
│  • Video files auto-transcode in background                          │
│  • Comments with timecodes on media files                            │
│                                                                      │
│  Dashboard shows: Creative direction, cue progress bar,              │
│                   hour tracking progress bars                        │
│                                                                      │
│  Client access: Share links for file review (password optional)      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ Work delivered
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  3. IN REVIEW  (status: "hold")                                      │
│                                                                      │
│  What happens here:                                                  │
│  • Client reviews via share link or client portal                    │
│  • Client can upload revision requests (→ TO AA folder)              │
│  • Timecoded comments on media files                                 │
│  • Comments can be marked as billable (extra work)                   │
│  • Cues marked as "revisions" if changes needed                      │
│                                                                      │
│  Client Portal: Login with project name + password                   │
│  → Browse files, upload, download, comment                           │
│                                                                      │
│          ┌────────────────────────┐                                  │
│          │ Revisions needed?      │                                  │
│          │ YES → Back to          │                                  │
│          │   IN PRODUCTION        │──────────┐                       │
│          │ NO → Move forward      │          │                       │
│          └────────────────────────┘          │                       │
└──────────────────────────────┬───────────────┼───────────────────────┘
                               │ Approved      │ (loop back)
                               ▼               │
┌──────────────────────────────────────────────┼───────────────────────┐
│  4. APPROVED & BILLED  (status: "completed") │                       │
│                                              │                       │
│  What happens here:                  ◄───────┘                       │
│  • Invoice generated from estimate                                   │
│    → Invoice number (auto: 25XX format)                              │
│    → Line items: Music Composition + Post-Production Audio           │
│    → Payment split: 50% deposit / 50% final                         │
│  • Payment tracking:                                                 │
│    → Record deposit (date, method, amount)                           │
│    → Record final payment                                            │
│    → Status: draft → sent → overdue → paid                          │
│                                                                      │
│  Dashboard badge:                                                    │
│    "deposit sent" (blue) → "invoiced" (yellow) →                    │
│    "payment received" (green)                                        │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ Fully paid & complete
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  5. ARCHIVE  (status: "completed", archived)                         │
│                                                                      │
│  • Collapsible column on kanban (click to expand)                    │
│  • Horizontal card layout                                            │
│  • Read-only historical record                                       │
│  • All data preserved                                                │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Accounting Flow (runs parallel to project stages)

```
Estimates                    Invoices                   Payments
─────────────────────────────────────────────────────────────────
Scope defined         →     Invoice created       →    Deposit recorded
 • TRT + music %             • Auto line items          • Date + method
 • Hours breakdown           • 50/50 split option       • Amount
 • Rate calculation          • Due date            →    Final recorded
 • Bundle discount           • PDF printable            • Invoice → paid
```

---

## File/Media Flow

```
FTP Drive (External mounted storage)
├── [Project Folder]/
│   ├── FROM AA/     ← Admin uploads deliverables
│   │   └── Media files → auto-transcode video
│   └── TO AA/       ← Client uploads revisions
│       └── Revision files

Share Links → Public Viewer (no login needed for file/FTP shares)
           → Client Portal (login required for project shares)
```

---

## Dashboard (Pinned Projects)

```
┌─────────────────────────────────────┐
│  PROJECT NAME                       │
│                                     │
│  Creative Direction                 │
│  "brilliant orchestral, drama"      │
│                                     │
│  Payment: ● deposit sent            │
│                                     │
│  Music Cue Status                   │
│  ████████████░░░░░░  (color-coded)  │
│  red→orange→yellow→green            │
│                                     │
│  Hour Tracking                      │
│  Dialogue      ████████░░  6.0/6h   │
│  Sound Design  ████████░░  8.0/8h   │
│  Mix           ████████░░  6.0/6h   │
│  Revisions     ██████░░░░  3.0/4h   │
└─────────────────────────────────────┘
```

---

## State Transitions & Business Rules

- Status changes are immediate on kanban drag
- Projects can move in any direction (revisions = back to production)
- Hours Logger only shows for active/in-review/approved columns
- Scope Summary only shows for prospects
- Archive is read-only (no editing, just viewing)
- Cue duration auto-calculated from timecodes of approved cues
- Video files auto-transcode on upload
- Activity logging tracks all project/file/payment events
- Caching layer (60s projects, 30s kanban data) invalidated on writes
