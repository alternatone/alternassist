# Alternassist - Accounting & Project Management Web App

## Project Overview
An all-in-one accounting and project management web application designed for Alternatone, with plans to integrate automation functions. This system will serve as a comprehensive business management tool tailored for creative professionals in the audio/music industry.

## Existing Component Analysis

### 1. Cue Tracker Demo (`cue_tracker_demo.html`)
**Purpose**: Music cue management for film/video projects
**Key Features**:
- Project-based cue organization
- Cue metadata tracking (number, title, timing, usage type, status)
- Real-time stats dashboard (total cues, duration, completion status)
- Export functionality to CSV
- Modal-based cue editing interface

**Technical Stack**: Vanilla HTML/CSS/JavaScript with localStorage

### 2. Estimate Calculator (`estimate_calculator.html`)
**Purpose**: Project cost estimation for music and post-production services
**Key Features**:
- Dynamic pricing calculation (music at $200/min, post at $500/day)
- Bundled service discounts
- Email copy generation
- Estimate saving/loading
- Integration with invoice generator

**Business Logic**:
- Music rate: $200/minute
- Day rate: $500 (8 hours)
- Bundle discount: 10% for combined services
- Tax estimation: 30%

### 3. Invoice Generator (`invoice_generator_standalone.html`)
**Purpose**: Professional invoice creation with branded layout
**Key Features**:
- Dual-pane interface (form + live preview)
- Print-optimized styling
- Payment split options (full/50%)
- Auto-incrementing invoice numbers
- Integration with payment dashboard

**Payment Methods Supported**: Venmo, Zelle, Bank Transfer, Check

### 4. Kanban Board (`kanban_board.html`)
**Purpose**: Visual project pipeline management
**Key Features**:
- Drag-and-drop project cards
- Status columns: Prospects → Active → Review → Complete
- Project metadata (title, client, status)
- Real-time column counts

### 5. Payment Dashboard (`payment_dashboard.html`)
**Purpose**: Invoice tracking and payment management
**Key Features**:
- Outstanding invoice tracking
- Overdue payment monitoring
- Payment recording and history
- Revenue statistics
- Follow-up logging

## Design System (Based on Alternatone Brand)

### Color Palette
```css
--primary-text: #1a1a1a
--secondary-text: #333
--subtle-text: #666
--muted-text: #888
--accent-blue: #007acc
--accent-red: #ff6b6b
--accent-green: #51cf66
--accent-orange: #ff922b
--accent-teal: #469FE0
--accent-purple: #845ec2
--bg-primary: #FDF8F0
--bg-secondary: #FEFDFA
```

### Typography
```css
--font-primary: 'DM Sans', system-ui, -apple-system, sans-serif
--font-display: 'Bricolage Grotesque', system-ui, sans-serif
--font-body: 'Public Sans', system-ui, sans-serif
--font-mono: 'Archivo', monospace
```

### Layout Principles
- **Container max-width**: 1200-1600px for dashboard layouts
- **Spacing**: 2rem base padding, 1.5rem section gaps
- **Radius**: 12px for cards/containers, 6px for inputs
- **Shadows**: Subtle depth with `0 4px 20px rgba(0,0,0,0.05)`
- **Responsive**: Mobile-first with breakpoints at 768px and 1024px

## Data Architecture

### Current Storage Pattern
All components use `localStorage` for data persistence with prefixed keys:
- `alternatone-estimates`
- `alternatone-invoices` 
- `alternatone-payments`
- Project-specific cue data

### Data Relationships
```
Project → Estimates → Invoices → Payments
Project → Cues (for music projects)
```

## Integration Points

### Cross-Component Data Flow
1. **Estimate → Invoice**: Project data transfers via `localStorage`
2. **Invoice → Payment Dashboard**: Invoice data auto-syncs
3. **Kanban → All Components**: Project status affects workflow

### Shared Utilities Needed
- Date formatting functions
- Currency formatting
- Project status management
- Data validation helpers

## Technical Recommendations for Full App

### 1. Framework Choice
Consider migrating to a modern framework (React/Vue/Svelte) for:
- Better state management
- Component reusability
- Enhanced data flow between sections

### 2. Database Layer
Transition from localStorage to:
- JSON file storage (simple)
- SQLite (local app)
- PostgreSQL/MongoDB (cloud deployment)

### 3. Authentication & Multi-User
- User accounts and permissions
- Client portal access
- Team collaboration features

### 4. Automation Integration Points
- Email automation for invoices/follow-ups
- Calendar integration for project deadlines
- Backup and sync capabilities
- Bank/payment processor API integration

## Development Progress (Updated Sept 29, 2025)

### ✅ Completed - Phase 1: Foundation
1. **Unified app shell** - Horizontal navigation with Alternatone styling
2. **Component integration** - All modules working as embedded iframes
3. **Shared state management** - localStorage-based data persistence
4. **Navigation redesign** - Dynamic gradient underline with smooth animations
5. **UI standardization** - Removed emojis, consistent styling, lowercase buttons
6. **Cross-component integration** - Estimates flow directly into project pipeline

### ✅ Completed - Estimate Calculator Overhaul
1. **Streamlined interface** - Removed clutter (saved estimates, copy buttons)
2. **New action buttons** - `send email` and `send to projects` 
3. **Live project integration** - Auto-creates projects in "Prospects" column
4. **Auto-navigation** - Switches to Projects tab after creation
5. **Data preservation** - All estimate data carried into project metadata

### 🔄 Current Status - Ready for Phase 2
**Live Features:**
- Horizontal navigation with gradient animation
- Estimate → Project workflow integration
- Real-time data persistence
- Cross-iframe communication
- Professional UI without emojis

**Next Components to Enhance:**
1. **Projects** - Enhanced metadata, filtering, status management
2. **Cues** - Project integration, better tracking
3. **Invoices** - Streamlined generation, project linking  
4. **Payments** - Enhanced tracking, reporting

### Phase 2: Component Enhancement (Next Session)
1. **Project Pipeline improvements** - Better metadata display, status workflows
2. **Cue Tracker integration** - Link to specific projects, enhanced tracking
3. **Invoice Generator refinement** - Project-based generation, better templates
4. **Payment Dashboard enhancement** - Advanced filtering, better reporting
5. **Mobile experience optimization** - Better responsive design
6. **Data export capabilities** - CSV, PDF export options

### Phase 3: Advanced Features (Future)
1. **Client portal development** - External client access
2. **Advanced reporting and analytics** - Business insights, trends
3. **Third-party integrations** - Email, calendar, payment processors
4. **Multi-user collaboration tools** - Team access, permissions
5. **Automation features** - Email templates, follow-up reminders

## Business Context
**Target User**: Creative freelancers and small agencies in audio/video production
**Core Value Proposition**: Streamlined business management tailored for creative workflows
**Revenue Model**: Efficiency gains through automation and integrated workflow management