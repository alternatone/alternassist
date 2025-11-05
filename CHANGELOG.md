# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-05

### Added
- Initial release of Alternassist
- Project pipeline management with kanban board
- Cue tracker for music projects
- Estimate calculator with dynamic pricing
- Invoice generator with professional templates
- Payment dashboard with tracking and analytics
- Accounting module
- NoteMarker Pro Tools PTSL integration
- Frame.io comment parsing and marker creation
- Horizontal navigation with gradient animations
- Cross-module data flow via localStorage
- Professional UI based on Alternatone brand guidelines

### Changed
- Reorganized repository structure to follow Electron best practices
- Moved all source code to organized `src/` directory structure
- Separated main process, renderer process, and integrations
- Consolidated documentation in `docs/` directory
- Moved build scripts to `scripts/` directory

### Technical
- Electron 38.2.1
- gRPC integration for PTSL communication
- Protocol Buffer support
- LocalStorage-based data persistence
- Iframe-based module architecture
