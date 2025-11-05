# Alternassist

> All-in-one accounting and project management application for creative professionals

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-38.2.1-47848F.svg)](https://www.electronjs.org/)

## Overview

Alternassist is a comprehensive business management tool designed specifically for creative professionals in the audio/video production industry. It combines project management, invoicing, payment tracking, and accounting features into a unified desktop application built with Electron.

## Features

- **Project Pipeline Management** - Visual kanban board for tracking projects from prospects to completion
- **Cue Tracker** - Music cue management for film/video projects with timing and status tracking
- **Estimate Calculator** - Dynamic pricing and project cost estimation with email generation
- **Invoice Generator** - Professional invoice creation with branded layouts and payment tracking
- **Payment Dashboard** - Invoice tracking, payment management, and revenue analytics
- **Accounting Module** - Comprehensive financial tracking and reporting
- **NoteMarker Integration** - Pro Tools integration via PTSL for automated marker creation from Frame.io comments

## Tech Stack

- **Runtime**: Electron 38.2.1
- **IPC**: gRPC (@grpc/grpc-js, protobufjs)
- **Logging**: electron-log
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Storage**: LocalStorage (with plans for database integration)
- **Build**: electron-packager / electron-builder

## Project Structure

```
alternassist/
├── src/
│   ├── main/                    # Main process (Electron)
│   │   ├── main.js              # Application entry point
│   │   └── preload.js           # Preload script for IPC
│   ├── renderer/                # Renderer process (UI)
│   │   ├── pages/               # HTML page modules
│   │   │   ├── index.html       # Main application shell
│   │   │   ├── accounting.html
│   │   │   ├── cue_tracker_demo.html
│   │   │   ├── estimate_calculator.html
│   │   │   ├── invoice_generator_standalone.html
│   │   │   ├── kanban_board.html
│   │   │   ├── payment_dashboard.html
│   │   │   ├── media_browser.html
│   │   │   ├── video_review.html
│   │   │   ├── notes.html
│   │   │   └── clear-data.html
│   │   ├── assets/              # Static assets (icons, images)
│   │   │   ├── icon.svg
│   │   │   ├── icon.icns
│   │   │   ├── icon-1024.png
│   │   │   ├── icon.iconset/
│   │   │   └── activity.csv
│   │   └── utils/               # Shared utilities
│   │       ├── shared-utils.js
│   │       ├── inject-sample-data.js
│   │       └── environment-detector.js
│   └── integrations/            # Third-party integrations
│       └── notemarker/          # Pro Tools PTSL integration
│           ├── ptsl-connection-manager.js
│           ├── ptsl-grpc-client.js
│           ├── ptsl-grpc-bridge.js
│           ├── ptsl-api-bridge.js
│           ├── ptsl-proto.js
│           ├── ptsl-error-handler.js
│           ├── ptsl-message-builder.js
│           ├── ptsl-time-formats.js
│           ├── timecode-calculator.js
│           ├── marker-creation-pipeline.js
│           ├── marker-conflict-detector.js
│           ├── frameio-parser.js
│           └── comprehensive-error-handler.js
├── proto/                       # Protocol Buffer definitions
├── docs/                        # Documentation
│   ├── PROJECT_CONTEXT.md
│   ├── DEVELOPMENT_LOG.md
│   ├── NOTEMARKER_INTEGRATION_PLAN.md
│   └── SYNC_IMPLEMENTATION_PLAN.md
├── scripts/                     # Build and utility scripts
│   ├── kill-alternassist.sh
│   └── launch-alternassist.command
├── .claude/                     # Claude Code configuration
├── package.json
├── package-lock.json
└── .gitignore
```

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- macOS (for current build configuration)
- Pro Tools with PTSL enabled (for NoteMarker features)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd alternassist

# Install dependencies
npm install
```

### Development

**Quick Start - Live Development:**
```bash
# Install dependencies (first time only)
npm install

# Start with hot reload (recommended for UI work)
npm run dev

# Start with auto-restart (for backend work)
npm run dev:watch

# Start with verbose logging (for debugging)
npm run dev:verbose
```

**What You Get:**
- ✅ Auto-reload when you save HTML/CSS/JS files
- ✅ DevTools opens automatically
- ✅ Console logs in terminal
- ✅ Real-time UI updates
- ⌨️  Press Ctrl+R to reload, Ctrl+Shift+I for DevTools

**📖 Full Development Guide:** See [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md)

**Other Commands:**
```bash
# Run as web app (limited functionality)
npm run web

# Production mode (no dev tools)
npm start
```

### Building

```bash
# Build for macOS (Apple Silicon)
npm run build

# Output will be in dist/
```

## Architecture

### Main Process
The main process (`src/main/main.js`) handles:
- Application lifecycle and window management
- IPC communication between main and renderer processes
- PTSL connection management for Pro Tools integration
- File system operations and native dialogs

### Renderer Process
The renderer process uses an iframe-based architecture where:
- `index.html` serves as the application shell with horizontal navigation
- Individual modules load as isolated iframes for encapsulation
- Cross-frame communication via localStorage and postMessage
- Responsive design with mobile-first breakpoints

### Data Layer
Currently uses localStorage with namespaced keys:
- `alternatone-estimates`
- `alternatone-invoices`
- `alternatone-payments`
- Project-specific data structures

Future roadmap includes migration to SQLite or cloud database.

## Design System

### Color Palette
- Primary Background: `#FDF8F0`
- Secondary Background: `#FEFDFA`
- Primary Text: `#1a1a1a`
- Accent Colors: Blue (`#007acc`), Teal (`#469FE0`), Purple (`#845ec2`)

### Typography
- Primary: DM Sans
- Display: Bricolage Grotesque
- Body: Public Sans
- Monospace: Archivo

## Key Features Detail

### Estimate → Project → Invoice Workflow
1. Create estimate with pricing calculator
2. Send to project pipeline (Kanban board)
3. Generate invoice from project data
4. Track payments in dashboard

### NoteMarker PTSL Integration
- Parses Frame.io comment export files
- Creates Pro Tools markers at specified timecodes
- Handles timecode format conversions (HH:MM:SS, samples, ticks)
- Conflict detection and resolution

## Contributing

This is a private project for Alternatone. For questions or suggestions, contact the development team.

## License

MIT License - see LICENSE file for details

## Author

Micah Garrido

## Roadmap

### Phase 2 (Planned)
- Enhanced project metadata and filtering
- Advanced invoice templates
- Improved reporting and analytics
- Mobile experience optimization

### Phase 3 (Future)
- Client portal with external access
- Third-party integrations (email, calendar, payment processors)
- Multi-user collaboration
- Automated follow-up reminders
- Cloud sync capabilities

## Support

For issues or feature requests, please refer to the project documentation in the `docs/` directory.
