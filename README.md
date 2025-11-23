# Alternassist

A comprehensive project management and workflow tool for creative professionals, built with Electron.

## Features

### Core Modules
- **Kanban Board** - Visual project task management
- **Notes System** - Integrated with Pro Tools via PTSL for marker creation
- **Estimate Calculator** - Project budgeting and estimation
- **Invoice Generator** - Client billing and invoicing
- **Payment Dashboard** - Payment tracking and management
- **Cue Tracker** - Track and manage audio/video cues
- **Accounting** - Financial overview and reporting
- **Media Management** - File upload, organization, and client collaboration

### Alternaview (Media Review System)
- Video and audio file review with commenting
- Project-based media organization
- Client portal for file sharing and feedback
- Timecode-based comments
- Support for large file uploads via resumable uploads

### NoteMarker (Pro Tools Integration)
- Direct integration with Pro Tools via PTSL
- Import Frame.io comments as Pro Tools markers
- Automated marker creation pipeline
- Session info extraction

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js, Express.js
- **Desktop**: Electron
- **Database**: SQLite (better-sqlite3)
- **File Uploads**: tus-node-server (resumable uploads)
- **Pro Tools**: PTSL integration via @avid/ctms-ptsdk

## Installation

```bash
npm install
```

## Development

```bash
npm start
```

## Project Structure

```
├── index.html              # Main Electron window
├── main.js                 # Electron main process
├── preload.js             # Electron preload script
├── alternaview-server.js  # Express server for media system
├── server/                # Backend routes and models
│   ├── routes/           # API endpoints
│   └── models/           # Database queries
├── src/                   # NoteMarker PTSL integration
│   └── notemarker/       # Pro Tools marker creation
├── public/               # Frontend HTML modules
├── client-portal/        # Client-facing media portal
└── assets/               # Images and icons
```

## Configuration

Configuration is managed in `alternaview-config.js`:
- Storage path for media files
- Server port
- File size limits
- Session settings

## Database

The app uses SQLite with the following main tables:
- `projects` - Project metadata
- `files` - Uploaded media files
- `comments` - File comments and feedback
- `estimates` - Project estimates
- `invoices` - Client invoices
- `payments` - Payment records
- `hours_log` - Time tracking
- `cues` - Audio/video cue tracking

## License

Proprietary
