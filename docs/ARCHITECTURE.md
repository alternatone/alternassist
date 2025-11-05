# Alternassist Architecture

## Overview

Alternassist is built on the Electron framework, utilizing a multi-process architecture that separates concerns between the main process (Node.js backend) and renderer processes (web-based UI).

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Application                     │
├──────────────────────────┬──────────────────────────────────┤
│     Main Process         │      Renderer Process            │
│   (Node.js Backend)      │        (Chromium UI)             │
│                          │                                  │
│  ┌──────────────────┐   │   ┌───────────────────────┐     │
│  │   main.js        │   │   │   index.html          │     │
│  │   - App lifecycle│   │   │   (App Shell)         │     │
│  │   - Window mgmt  │   │   │                       │     │
│  │   - IPC handlers │   │   │   ┌───────────────┐   │     │
│  └────────┬─────────┘   │   │   │  Navigation   │   │     │
│           │              │   │   └───────────────┘   │     │
│  ┌────────▼─────────┐   │   │                       │     │
│  │  preload.js      │◄──┼───┤   ┌───────────────┐   │     │
│  │  - IPC Bridge    │   │   │   │  Module       │   │     │
│  └──────────────────┘   │   │   │  Containers   │   │     │
│                          │   │   │  (iframes)    │   │     │
│  ┌──────────────────┐   │   │   └───┬───────┬───┘   │     │
│  │  Integrations    │   │   │       │       │       │     │
│  │                  │   │   │   ┌───▼───┐ ┌─▼────┐  │     │
│  │  ┌────────────┐  │   │   │   │Kanban │ │Cues  │  │     │
│  │  │ NoteMarker │  │   │   │   │ etc.  │ │ etc. │  │     │
│  │  │  - PTSL    │  │   │   │   └───────┘ └──────┘  │     │
│  │  │  - gRPC    │  │   │   └───────────────────────┘     │
│  │  └────────────┘  │   │                                  │
│  └──────────────────┘   │                                  │
└──────────────────────────┴──────────────────────────────────┘
           │                              │
           │                              │
           ▼                              ▼
    ┌────────────┐              ┌──────────────────┐
    │ Pro Tools  │              │  LocalStorage    │
    │   (PTSL)   │              │  Data Layer      │
    └────────────┘              └──────────────────┘
```

## Directory Structure

```
alternassist/
├── src/
│   ├── main/                    # Main Process
│   │   ├── main.js              # Electron entry point
│   │   └── preload.js           # Secure IPC bridge
│   │
│   ├── renderer/                # Renderer Process
│   │   ├── pages/               # UI Modules
│   │   │   ├── index.html       # Application shell
│   │   │   ├── kanban_board.html
│   │   │   ├── cue_tracker_demo.html
│   │   │   ├── estimate_calculator.html
│   │   │   ├── invoice_generator_standalone.html
│   │   │   ├── payment_dashboard.html
│   │   │   ├── accounting.html
│   │   │   ├── notes.html
│   │   │   ├── media_browser.html
│   │   │   ├── video_review.html
│   │   │   └── clear-data.html
│   │   │
│   │   ├── assets/              # Static Resources
│   │   │   ├── icon.svg
│   │   │   ├── icon.icns
│   │   │   └── icon-1024.png
│   │   │
│   │   └── utils/               # Shared Utilities
│   │       ├── shared-utils.js
│   │       ├── inject-sample-data.js
│   │       └── environment-detector.js
│   │
│   └── integrations/            # External Integrations
│       └── notemarker/          # Pro Tools PTSL Integration
│           ├── ptsl-connection-manager.js
│           ├── ptsl-grpc-client.js
│           ├── ptsl-api-bridge.js
│           ├── marker-creation-pipeline.js
│           └── ... (14 modules total)
│
├── proto/                       # Protocol Buffer Definitions
├── docs/                        # Documentation
├── scripts/                     # Build Scripts
└── public/                      # Public Assets
```

## Process Communication

### Main ↔ Renderer IPC

The application uses Electron's IPC (Inter-Process Communication) for secure communication:

```javascript
// Main Process (main.js)
ipcMain.handle('ptsl:connect', async () => {
    // Handle PTSL connection
});

// Renderer Process (via preload.js)
window.electronAPI.ptsl.connect();
```

### Module Communication

Modules communicate via:
1. **LocalStorage** - Shared data persistence
2. **PostMessage** - Cross-iframe communication
3. **Custom Events** - DOM-based messaging

```
┌──────────────┐
│  Estimates   │──┐
└──────────────┘  │
                  ├──► LocalStorage ◄──┐
┌──────────────┐  │                    │  ┌──────────────┐
│   Kanban     │──┘                    └──│   Invoices   │
└──────────────┘                          └──────────────┘
```

## Data Flow

### Estimate → Project → Invoice Workflow

```
1. Estimate Calculator
   ├─► Calculate pricing
   ├─► Generate estimate
   └─► Save to localStorage
           │
           ▼
2. Send to Projects
   ├─► Create project object
   ├─► Add to Kanban (Prospects)
   └─► Navigate to Projects view
           │
           ▼
3. Project Pipeline
   ├─► Track through stages
   ├─► Update status
   └─► Drag between columns
           │
           ▼
4. Invoice Generator
   ├─► Load project data
   ├─► Generate invoice
   └─► Save to localStorage
           │
           ▼
5. Payment Dashboard
   ├─► Track invoice status
   ├─► Record payments
   └─► Update analytics
```

## Integration Points

### Pro Tools (PTSL) Integration

```
Frame.io Export (.txt)
       │
       ▼
┌──────────────────┐
│  frameio-parser  │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────┐
│ marker-creation-pipeline │
└────────┬─────────────────┘
         │
         ▼
┌────────────────────┐
│ ptsl-grpc-client   │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│   Pro Tools DAW    │
│  (localhost:31416) │
└────────────────────┘
```

### Technology Stack

- **Framework**: Electron 38.2.1
- **IPC**: gRPC (@grpc/grpc-js)
- **Serialization**: Protocol Buffers (protobufjs)
- **Logging**: electron-log
- **UI**: Vanilla JavaScript, HTML5, CSS3
- **Data**: LocalStorage (transitioning to database)

## Module Architecture

Each module follows a consistent pattern:

```javascript
// Module Structure
{
    // Data Layer
    loadData()      // Load from localStorage
    saveData()      // Persist to localStorage

    // UI Layer
    renderUI()      // Update DOM
    setupHandlers() // Event listeners

    // Business Logic
    calculate()     // Process data
    validate()      // Data validation

    // Communication
    postMessage()   // Cross-module events
    handleMessage() // Listen for events
}
```

## Security Considerations

1. **Context Isolation**: Enabled in all windows
2. **Node Integration**: Disabled in renderer
3. **Preload Scripts**: Controlled IPC exposure
4. **Content Security**: No remote code execution
5. **Data Validation**: Input sanitization

## Performance Optimizations

1. **Lazy Loading**: Modules load on demand
2. **Background Throttling**: Disabled for consistency
3. **Iframe Isolation**: Memory and process separation
4. **LocalStorage Caching**: Fast data access
5. **Debounced Updates**: Reduced re-renders

## Future Architecture Plans

### Phase 2
- SQLite database integration
- Enhanced state management
- WebSocket for real-time updates
- Service worker for offline support

### Phase 3
- Cloud sync capabilities
- Multi-user support
- RESTful API backend
- WebRTC for collaboration
- Microservices architecture for scaling

## Development Guidelines

1. **Separation of Concerns**
   - Keep main and renderer logic separate
   - Use integrations/ for external APIs
   - Maintain clear module boundaries

2. **Data Management**
   - Use consistent localStorage keys
   - Validate all data inputs
   - Handle migration for schema changes

3. **Error Handling**
   - Comprehensive error logging
   - User-friendly error messages
   - Graceful degradation

4. **Testing Strategy**
   - Unit tests for business logic
   - Integration tests for IPC
   - E2E tests for critical workflows

## Monitoring & Debugging

- **electron-log**: Application logging
- **DevTools**: Chrome developer tools
- **PTSL Logging**: Integration diagnostics
- **Console Monitoring**: Runtime debugging

For implementation details, see individual module documentation.
