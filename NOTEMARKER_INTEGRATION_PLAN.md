# NoteMarker Integration Plan
## Integrating NoteMarker into Alternassist as "Notes" Module

---

## Overview
Integrate the standalone NoteMarker Electron app into Alternassist as a "notes" module that only appears in the Electron desktop version. The web version will not show the notes navigation link.

---

## Project Context

### NoteMarker Current Architecture
- **Type**: Standalone Electron desktop application
- **Purpose**: Converts Frame.io comments to Pro Tools markers via PTSL gRPC API
- **Location**: `/Developer/NoteMarker/NoteMarker Electron Project/`
- **Key Dependencies**:
  - PTSL gRPC client (localhost:31416)
  - Node.js native modules (@grpc/grpc-js, fs, path)
  - Electron-specific APIs (dialog, ipcMain, BrowserWindow)

### Why Electron-Only
- **PTSL gRPC**: Requires Node.js runtime (not available in browser)
- **File System Access**: Native file operations for Frame.io TXT import
- **Local Pro Tools Connection**: Connects to Pro Tools running on the same machine
- **No Web Alternative**: PTSL cannot be accessed from browser environment

---

## Integration Strategy: Option 1 - Conditional Module

### Architecture
```
Alternassist/
├── index.html (main app shell)
├── main.js (Electron main process)
├── preload.js (security bridge)
├── HTML Sketches/
│   ├── accounting.html
│   ├── payment_dashboard.html
│   └── notemarker.html (NEW - NoteMarker UI)
├── src/
│   ├── notemarker/ (NEW - NoteMarker backend logic)
│   │   ├── ptsl-connection-manager.js
│   │   ├── ptsl-grpc-client.js
│   │   ├── marker-creation-pipeline.js
│   │   └── ... (all PTSL modules)
│   └── environment-detector.js (NEW)
└── assets/
    └── notemarker/ (NEW - NoteMarker assets)
```

---

## Phase 1: Environment Detection

### 1.1 Create Environment Detector

**File**: `src/environment-detector.js`

```javascript
// Detect if running in Electron or browser
function isElectron() {
    // Check if running in Electron renderer process
    if (typeof window !== 'undefined' &&
        typeof window.process === 'object' &&
        window.process.type === 'renderer') {
        return true;
    }

    // Check if Electron is available via require (Node.js context)
    if (typeof process !== 'undefined' &&
        process.versions &&
        process.versions.electron) {
        return true;
    }

    // Check for electron in user agent
    if (typeof navigator === 'object' &&
        typeof navigator.userAgent === 'string' &&
        navigator.userAgent.indexOf('Electron') >= 0) {
        return true;
    }

    return false;
}

function isPTSLAvailable() {
    // Only available in Electron
    return isElectron();
}

module.exports = {
    isElectron,
    isPTSLAvailable
};
```

### 1.2 Update Navigation to Conditionally Show Notes

**File**: `index.html` - Update navigation section

```html
<ul class="nav-links">
    <li><a href="#" class="nav-link active" data-module="dashboard">dashboard</a></li>
    <li><a href="#" class="nav-link" data-module="estimates">estimates</a></li>
    <li><a href="#" class="nav-link" data-module="projects">projects</a></li>
    <li><a href="#" class="nav-link" data-module="cues">cues</a></li>
    <li><a href="#" class="nav-link" data-module="invoices">invoices</a></li>
    <li><a href="#" class="nav-link" data-module="payments">payments</a></li>
    <li><a href="#" class="nav-link" data-module="accounting">accounting</a></li>
    <!-- Notes link only shown in Electron -->
    <li id="notes-nav-item" style="display: none;">
        <a href="#" class="nav-link" data-module="notes">notes</a>
    </li>
</ul>
```

**Add JavaScript to show/hide notes link:**

```javascript
// Show notes link only in Electron
if (typeof window.electronAPI !== 'undefined') {
    document.getElementById('notes-nav-item').style.display = 'block';
}
```

---

## Phase 2: Copy NoteMarker Files

### 2.1 Directory Structure

```
Alternassist/
├── src/
│   └── notemarker/
│       ├── ptsl-connection-manager.js
│       ├── ptsl-grpc-client.js
│       ├── ptsl-grpc-bridge.js
│       ├── ptsl-api-bridge.js
│       ├── ptsl-message-builder.js
│       ├── ptsl-error-handler.js
│       ├── ptsl-time-formats.js
│       ├── ptsl-proto.js
│       ├── marker-creation-pipeline.js
│       └── comprehensive-error-handler.js
├── proto/
│   └── PTSL.proto
├── HTML Sketches/
│   └── notemarker.html (extracted from renderer/index.html)
└── assets/
    └── notemarker/
        └── (any NoteMarker-specific assets)
```

### 2.2 Files to Copy

**From NoteMarker → To Alternassist:**

```bash
# Backend logic
NoteMarker/src/* → Alternassist/src/notemarker/

# Proto definition
NoteMarker/proto/PTSL.proto → Alternassist/proto/PTSL.proto

# Frontend UI
NoteMarker/renderer/index.html → Alternassist/HTML Sketches/notemarker.html

# Preload additions (merge into existing)
NoteMarker/preload.js → Alternassist/preload.js (merge PTSL APIs)

# Assets (if any)
NoteMarker/assets/* → Alternassist/assets/notemarker/
```

---

## Phase 3: Merge Electron Main Process

### 3.1 Update main.js

**File**: `main.js`

Add NoteMarker-specific imports and IPC handlers:

```javascript
// Existing imports
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

// NEW: NoteMarker imports (only in Electron)
const { PTSLConnectionManager } = require('./src/notemarker/ptsl-connection-manager');
const MarkerCreationPipeline = require('./src/notemarker/marker-creation-pipeline');

// Initialize PTSL connection manager
let ptslManager = null;
let markerPipeline = null;

function initializePTSL() {
    ptslManager = new PTSLConnectionManager({
        host: 'localhost',
        port: 31416,
        companyName: 'alternatone',
        applicationName: 'alternassist'
    });

    markerPipeline = new MarkerCreationPipeline(ptslManager);
}

// Initialize PTSL when app is ready
app.whenReady().then(() => {
    createWindow();
    initializePTSL();
});
```

### 3.2 Add NoteMarker IPC Handlers

```javascript
// PTSL Connection
ipcMain.handle('ptsl:connect', async () => {
    try {
        await ptslManager.connect();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('ptsl:disconnect', async () => {
    await ptslManager.disconnect();
    return { success: true };
});

ipcMain.handle('ptsl:getConnectionStatus', async () => {
    return {
        connected: ptslManager.isConnected(),
        sessionInfo: ptslManager.getSessionInfo()
    };
});

// Session Info
ipcMain.handle('ptsl:getSessionInfo', async () => {
    try {
        const sessionInfo = await ptslManager.getSessionInfo();
        return { success: true, data: sessionInfo };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Marker Creation
ipcMain.handle('ptsl:createMarkersFromFile', async (event, filePath) => {
    try {
        const result = await markerPipeline.processFrameIOFile(filePath);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// File dialog for Frame.io TXT files
ipcMain.handle('dialog:openFile', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, filePath: result.filePaths[0] };
    }
    return { success: false };
});
```

---

## Phase 4: Update Preload Script

### 4.1 Add NoteMarker APIs to preload.js

**File**: `preload.js`

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Existing Alternassist APIs...

    // NEW: NoteMarker PTSL APIs
    ptsl: {
        connect: () => ipcRenderer.invoke('ptsl:connect'),
        disconnect: () => ipcRenderer.invoke('ptsl:disconnect'),
        getConnectionStatus: () => ipcRenderer.invoke('ptsl:getConnectionStatus'),
        getSessionInfo: () => ipcRenderer.invoke('ptsl:getSessionInfo'),
        createMarkersFromFile: (filePath) => ipcRenderer.invoke('ptsl:createMarkersFromFile', filePath)
    },

    // File dialog
    openFileDialog: () => ipcRenderer.invoke('dialog:openFile')
});
```

---

## Phase 5: Create NoteMarker Module HTML

### 5.1 Extract and Adapt UI

**File**: `HTML Sketches/notemarker.html`

Extract the UI from `NoteMarker/renderer/index.html` and adapt it:

1. Remove `<head>` and `<body>` tags (will be embedded)
2. Keep all CSS (inline or extract to separate file)
3. Update JavaScript to use `window.electronAPI.ptsl` instead of direct IPC
4. Apply Alternassist design system styling
5. Remove `overflow: hidden` from body (like other modules)

**Structure:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notes - NoteMarker</title>
    <link href="..." rel="stylesheet"> <!-- Shared fonts -->
    <style>
        /* Adapted NoteMarker styles with Alternassist design tokens */
        :root {
            --primary-text: #1a1a1a;
            --accent-teal: #469FE0;
            /* ... match Alternassist variables */
        }

        body {
            font-family: var(--font-primary);
            background: var(--bg-primary);
            overflow: hidden; /* No internal scrollbar */
        }

        /* ... rest of NoteMarker styles */
    </style>
</head>
<body>
    <!-- NoteMarker UI content -->
    <div class="notemarker-container">
        <!-- Connection status -->
        <!-- File upload -->
        <!-- Progress display -->
        <!-- Results -->
    </div>

    <script>
        // Replace direct ipcRenderer with window.electronAPI
        async function connectToPTSL() {
            const result = await window.electronAPI.ptsl.connect();
            if (result.success) {
                updateConnectionStatus('connected');
            } else {
                showError(result.error);
            }
        }

        // ... rest of NoteMarker JavaScript
    </script>
</body>
</html>
```

---

## Phase 6: Update Alternassist Main HTML

### 6.1 Add Notes Module Container

**File**: `index.html`

Add notes module after accounting:

```html
<!-- Accounting Module -->
<div class="module-container" id="accounting-module">
    <iframe class="module-frame" src="HTML Sketches/accounting.html"></iframe>
</div>

<!-- Notes Module (Electron only) -->
<div class="module-container" id="notes-module">
    <iframe class="module-frame" src="HTML Sketches/notemarker.html"></iframe>
</div>
```

---

## Phase 7: Merge Package Dependencies

### 7.1 Update package.json

**File**: `package.json`

Merge dependencies from NoteMarker:

```json
{
  "name": "alternassist",
  "version": "1.0.0",
  "main": "main.js",
  "dependencies": {
    "electron": "^37.2.6",
    "@grpc/grpc-js": "^1.13.4",
    "protobufjs": "^7.5.3",
    "electron-log": "^5.0.0"
  },
  "devDependencies": {
    "electron-builder": "^26.0.12"
  }
}
```

### 7.2 Install New Dependencies

```bash
cd "/Users/alternatone/Library/Mobile Documents/com~apple~CloudDocs/Developer/Alternassist"
npm install @grpc/grpc-js protobufjs electron-log
```

---

## Phase 8: Testing Strategy

### 8.1 Test in Electron

1. **Launch Alternassist Electron app**
   ```bash
   npm start
   ```

2. **Verify "notes" link appears** in navigation

3. **Click notes link** and verify NoteMarker loads

4. **Test PTSL connection**
   - Open Pro Tools
   - Enable PTSL in Pro Tools preferences
   - Click "Connect to Pro Tools" in notes module
   - Verify connection status

5. **Test marker creation**
   - Import Frame.io TXT file
   - Verify markers are created in Pro Tools

### 8.2 Test in Web Browser

1. **Launch web server**
   ```bash
   python3 -m http.server 8080
   ```

2. **Open http://localhost:8080**

3. **Verify "notes" link does NOT appear** in navigation

4. **Verify all other modules work** normally

---

## Phase 9: Build Configuration

### 9.1 Update electron-builder Config

**File**: `package.json` (build section)

```json
{
  "build": {
    "appId": "com.alternatone.alternassist",
    "productName": "Alternassist",
    "files": [
      "**/*",
      "!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
      "!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}",
      "!**/node_modules/*.d.ts",
      "!**/node_modules/.bin",
      "!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}",
      "!.editorconfig",
      "!**/._*",
      "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
      "!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}",
      "!**/{appveyor.yml,.travis.yml,circle.yml}",
      "!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}"
    ],
    "extraResources": [
      {
        "from": "proto",
        "to": "proto"
      }
    ],
    "mac": {
      "category": "public.app-category.business",
      "icon": "assets/icon.icns",
      "target": ["dmg", "zip"]
    }
  }
}
```

---

## File Checklist

### Files to Create
- [ ] `src/environment-detector.js`
- [ ] `HTML Sketches/notemarker.html`
- [ ] `src/notemarker/` (directory with all PTSL modules)
- [ ] `proto/PTSL.proto`

### Files to Modify
- [ ] `index.html` (add notes nav link + module container)
- [ ] `main.js` (add PTSL initialization + IPC handlers)
- [ ] `preload.js` (add PTSL APIs)
- [ ] `package.json` (merge dependencies + build config)

### Files to Copy from NoteMarker
- [ ] All `src/*.js` files → `src/notemarker/`
- [ ] `proto/PTSL.proto` → `proto/PTSL.proto`
- [ ] `renderer/index.html` content → `HTML Sketches/notemarker.html`
- [ ] Any assets → `assets/notemarker/`

---

## Implementation Steps

### Step 1: Preparation (30 min)
- [ ] Backup current Alternassist project
- [ ] Review NoteMarker codebase structure
- [ ] Create file/folder structure in Alternassist

### Step 2: Copy Files (1 hour)
- [ ] Copy all NoteMarker backend modules to `src/notemarker/`
- [ ] Copy PTSL.proto to `proto/`
- [ ] Extract UI from NoteMarker to `notemarker.html`
- [ ] Copy any required assets

### Step 3: Update Electron Infrastructure (1-2 hours)
- [ ] Create environment detector
- [ ] Update main.js with PTSL imports and IPC handlers
- [ ] Update preload.js with PTSL APIs
- [ ] Merge package.json dependencies
- [ ] Run `npm install`

### Step 4: Integrate UI (1-2 hours)
- [ ] Add notes nav link (conditional display)
- [ ] Add notes module container
- [ ] Adapt NoteMarker styles to match Alternassist
- [ ] Update JavaScript to use window.electronAPI
- [ ] Remove internal scrollbar (match other modules)

### Step 5: Test Electron Build (1 hour)
- [ ] Test in development mode (`npm start`)
- [ ] Verify notes link appears
- [ ] Test PTSL connection with Pro Tools
- [ ] Test Frame.io file import
- [ ] Test marker creation end-to-end

### Step 6: Test Web Build (30 min)
- [ ] Launch web server
- [ ] Verify notes link is hidden
- [ ] Verify other modules work normally

### Step 7: Build & Package (30 min)
- [ ] Build for macOS (`npm run build:mac`)
- [ ] Test packaged app
- [ ] Verify notes module works in production build

---

## Timeline Estimate

- **Phase 1-2 (Setup + Copy)**: 1.5 hours
- **Phase 3-4 (Backend Integration)**: 2-3 hours
- **Phase 5-6 (Frontend Integration)**: 1-2 hours
- **Phase 7 (Dependencies)**: 30 minutes
- **Phase 8 (Testing)**: 1-2 hours
- **Phase 9 (Build)**: 30 minutes
- **Total**: 7-10 hours

---

## Potential Issues & Solutions

### Issue 1: Module Path Resolution
**Problem**: Import paths break after moving files
**Solution**: Update all `require()` paths to use absolute paths from project root

### Issue 2: PTSL Connection Fails
**Problem**: Cannot connect to Pro Tools
**Solution**:
- Ensure Pro Tools is running
- Enable PTSL in Pro Tools > Setup > Preferences > MIDI/Sync > gRPC
- Check port 31416 is not blocked

### Issue 3: Styling Conflicts
**Problem**: NoteMarker styles clash with Alternassist
**Solution**:
- Namespace all NoteMarker CSS classes (`.notemarker-*`)
- Use CSS custom properties from Alternassist design system
- Test in isolated iframe

### Issue 4: Build Size Increase
**Problem**: Adding NoteMarker increases bundle size significantly
**Solution**:
- Already Electron-only, no web build impact
- gRPC modules only loaded in Electron context
- Consider lazy loading PTSL modules

---

## Security Considerations

### IPC Security
- All PTSL operations go through main process
- File system access controlled by Electron dialog API
- No direct file path manipulation in renderer

### PTSL Connection
- Only connects to localhost
- No external network access required
- Uses gRPC over localhost (secure by default)

---

## Future Enhancements

### Phase 10 (Optional)
- [ ] Add NoteMarker settings to Alternassist settings page
- [ ] Integrate NoteMarker logs with Alternassist logging system
- [ ] Add keyboard shortcuts for common NoteMarker actions
- [ ] Create unified error handling between modules
- [ ] Add NoteMarker activity to dashboard overview

---

## Rollback Plan

If integration causes issues:
1. Remove notes nav link from `index.html`
2. Remove notes module container
3. Remove NoteMarker IPC handlers from `main.js`
4. Remove PTSL APIs from `preload.js`
5. Delete `src/notemarker/` directory
6. Revert package.json dependencies
7. Run `npm install` to remove unused dependencies

NoteMarker standalone app remains functional and can be used independently.

---

## Success Criteria

✅ Notes link appears in Electron app navigation
✅ Notes link hidden in web browser
✅ PTSL connection works in Electron
✅ Frame.io file import works
✅ Markers created successfully in Pro Tools
✅ All other Alternassist modules continue to work
✅ Web version unaffected by NoteMarker code
✅ Electron build packages successfully
✅ No console errors in either environment

---

**Note**: This integration maintains NoteMarker as a fully self-contained module. The standalone NoteMarker app can continue to exist independently if needed.
