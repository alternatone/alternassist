# Alternassist - Claude Context

## Project Overview
Alternassist is an all-in-one accounting and project management Electron app for creative professionals. It includes modules for project management, cue tracking, estimates, invoices, payments, accounting, and notes (NoteMarker - Frame.io to Pro Tools integration).

## Important: Launching & Killing Electron App

**⚠️ CRITICAL - VS Code Crash Prevention:**

VS Code is built on Electron! Using `killall Electron` kills BOTH Alternassist AND VS Code, causing crashes.

**⚠️ CRITICAL - Single Instance Only:**

**ALWAYS kill any existing Alternassist instance BEFORE launching a new one.** Running multiple instances causes conflicts and performance issues.

### ✅ Safe Launch Method (ALWAYS kill first):

```bash
# Kill ALL existing instances first (force kill to ensure complete cleanup)
pkill -9 -f "Alternassist.*Electron"

# Wait a moment, then launch
sleep 1 && cd "/Users/micah/Library/Mobile Documents/com~apple~CloudDocs/Developer/Alternassist" && nohup npm start > /dev/null 2>&1 & echo "Electron launched with PID: $!"
```

Or use the combined command:

```bash
pkill -9 -f "Alternassist.*Electron" && sleep 1 && cd "/Users/micah/Library/Mobile Documents/com~apple~CloudDocs/Developer/Alternassist" && nohup npm start > /dev/null 2>&1 & echo "Alternassist relaunched with PID: $!"
```

Or double-click `launch-alternassist.command` in Finder.

### ✅ Safe Kill Method:

**ALWAYS use this to kill ALL Alternassist instances (never killall Electron):**

```bash
pkill -9 -f "Alternassist.*Electron"
```

The `-9` flag forces termination, and the broader pattern ensures all related processes are killed.

Or run the `kill-alternassist.sh` script.

### ❌ Methods That Cause VS Code Crashes:

- `killall Electron` - **KILLS VS CODE TOO!**
- `npm start` (in background with run_in_background flag)
- `npx electron .` (in background)
- Any Electron command that keeps terminal connection

## Project Structure

```
Alternassist/
├── index.html              # Main entry point with navigation
├── main.js                 # Electron main process
├── preload.js             # Electron preload script
├── package.json           # Dependencies and scripts
├── HTML Sketches/         # Module pages
│   ├── kanban_board.html          # Projects/Pipeline
│   ├── cue_tracker_demo.html      # Music cue tracking
│   ├── estimate_calculator.html    # Cost estimates
│   ├── invoice_generator_standalone.html  # Invoice creation
│   ├── payment_dashboard.html      # Payment tracking
│   ├── accounting.html             # Financial transactions
│   └── notes.html                  # NoteMarker (Frame.io → Pro Tools)
└── src/
    └── notemarker/        # Pro Tools PTSL integration
```

## Design System

### Typography
All pages use consistent CSS variables:

- `--font-primary`: 'DM Sans' - Used for all buttons, body text, UI elements
- `--font-display`: 'Bricolage Grotesque' - Headers and titles
- `--font-body`: 'Public Sans' - Paragraphs and content
- `--font-mono`: 'Archivo' - Code, numbers, technical data

### Button Styling
**All buttons have explicit `font-family: var(--font-primary);`**

Common button classes:
- `.btn` - Base button style
- `.btn-primary` - Primary action (teal)
- `.btn-secondary` - Secondary action (gray)
- `.btn-success` - Success action (green)
- `.btn-danger` - Destructive action (red)
- `.action-btn` - Action buttons in tables
- `.upload-btn` - File upload buttons
- `.connection-button` - Connection status buttons

### Color Palette
```css
--accent-blue: #007acc
--accent-red: #ff6b6b
--accent-green: #51cf66
--accent-orange: #ff922b
--accent-teal: #469FE0
--accent-purple: #845ec2
--bg-primary: #FDF8F0
--bg-secondary: #FEFDFA
```

## Key Features by Module

### 1. Projects (kanban_board.html)
- Kanban-style project pipeline
- Project cards with status tracking
- Pin projects to dashboard
- Notes and payment status

### 2. Cues (cue_tracker_demo.html)
- Music cue tracking per project
- Status workflow: To Write → Written → Revisions → Approved
- Timecode integration
- Theme/style notes

### 3. Estimates (estimate_calculator.html)
- Cost calculation with breakdown
- Copy to clipboard functionality
- Estimate history logging

### 4. Invoices (invoice_generator_standalone.html)
- Professional invoice generation
- Print/export functionality
- Links to payment dashboard

### 5. Payments (payment_dashboard.html)
- Track invoice payment status
- Follow-up logging
- Payment history

### 6. Accounting (accounting.html)
- Income/expense tracking
- Transaction categorization
- Financial overview stats

### 7. Notes - NoteMarker (notes.html)
- Frame.io comment import (.txt files)
- Pro Tools PTSL connection
- Automated marker creation
- Timecode offset handling

## NoteMarker Technical Details

### PTSL Integration
- Connection Manager: `src/notemarker/ptsl-connection-manager.js`
- Marker Pipeline: `src/notemarker/marker-creation-pipeline.js`
- Host: localhost:31416
- Requires Pro Tools running with PTSL enabled

### IPC Channels
- `ptsl:connect` - Connect to Pro Tools
- `ptsl:disconnect` - Disconnect from Pro Tools
- `ptsl:getConnectionStatus` - Check connection status
- `ptsl:getSessionInfo` - Get session details
- `ptsl:createMarkersFromFile` - Create markers from parsed comments

## Development Notes

### Recent UI Fixes
- Removed border-top from notes.html controls section
- Reduced spacing above "Start Over" and "Create Markers" buttons from 2rem to 1rem
- Added explicit font-family to all button classes across all pages for consistency

### localStorage Usage
All modules use localStorage for data persistence:
- Projects: `kanban-projects`
- Cues: `cue-tracker-cues`
- Estimates: `logged-estimates`
- Invoices: `logged-invoices`
- Payments: Payment status stored in invoice objects
- Accounting: `accounting-transactions`

### File Naming
- Main module files are in `HTML Sketches/` directory
- NoteMarker page was renamed from `notemarker.html` to `notes.html`
- Reference updated in index.html line 263

## Build & Distribution

### Development
```bash
npm start    # Start app (use detached method in VS Code!)
```

### Build
```bash
npm run build  # Creates distributable in /dist
```

### Build Output
```
dist/
├── Alternassist-darwin-arm64/
│   └── Alternassist.app
```

## Notes for AI Assistant

1. **Always use detached launch method for Electron** - prevents VS Code crashes
2. **All button typography is now explicit** - no reliance on inheritance
3. **index.html is the main shell** - modules load via iframes
4. **Notes module is Electron-only** - shows/hides based on electronAPI presence
5. **PTSL requires Pro Tools** - graceful degradation if not connected
6. **All changes should maintain design system consistency** - use CSS variables
7. **Test in actual Electron app** - iframe behavior differs from standalone HTML

## Common Tasks

### Add a new module
1. Create HTML file in `HTML Sketches/`
2. Add iframe in index.html `<main>` section
3. Add nav link in index.html with `data-module` attribute
4. Ensure button styles use `font-family: var(--font-primary);`

### Update button styles
All buttons must include:
```css
.btn {
    font-family: var(--font-primary);
    /* other styles */
}
```

### Debug PTSL issues
Check electron console (uncomment `mainWindow.webContents.openDevTools()` in main.js line 40)
