# Development Workflow Guide

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

This installs:
- `electron-reload` - Automatic reloading when files change
- `nodemon` - File watcher for restarting the app
- All other project dependencies

### 2. Start Development Mode

**Option A: Hot Reload (Recommended)**
```bash
npm run dev
```
- ✅ DevTools opens automatically
- ✅ Changes to HTML/CSS reload instantly
- ✅ Console logs visible in terminal
- ⚠️  Main process changes require manual restart (Ctrl+C, then `npm run dev` again)

**Option B: Auto-Restart on Any Change**
```bash
npm run dev:watch
```
- ✅ Watches ALL files (including main process)
- ✅ Automatically restarts app when ANY file changes
- ⚠️  Slower (full restart each time)
- 💡 Best when working on main process (main.js, services, etc.)

**Option C: Verbose Logging**
```bash
npm run dev:verbose
```
- ✅ Same as `npm run dev` but with detailed Electron logs
- 💡 Use when debugging low-level issues

### 3. Make Changes and See Results Live!

## 📁 What Gets Reloaded

### Instant Reload (No Restart Needed)
- ✅ HTML files (`src/renderer/pages/*.html`)
- ✅ CSS changes (inline or external)
- ✅ JavaScript in renderer process (client-side JS)
- ✅ Asset changes (images, fonts)

**How**: electron-reload watches files and triggers `webContents.reload()`

### Requires Restart
- ⚠️  Main process files (`src/main/main.js`)
- ⚠️  Services (`src/main/services/*.js`)
- ⚠️  Integrations (`src/integrations/**/*.js`)
- ⚠️  `package.json`, `preload.js`

**Solution**: Use `npm run dev:watch` or manually restart (Ctrl+C → `npm run dev`)

## ⌨️  Keyboard Shortcuts

When running in development mode:

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + R` | Reload page (refreshes UI) |
| `Ctrl/Cmd + Shift + R` | Hard reload (clears cache) |
| `Ctrl/Cmd + Shift + I` | Toggle DevTools |
| `Ctrl/Cmd + Q` | Quit application |
| `Ctrl/Cmd + W` | Close window |

## 🔧 Development Tools

### DevTools (Auto-Opens in Dev Mode)

**Elements Tab**
- Inspect HTML structure
- View and modify CSS live
- See computed styles

**Console Tab**
- View JavaScript errors
- Log messages from your code
- Test code snippets

**Network Tab**
- Monitor resource loading
- Debug failed requests

**Application Tab**
- Inspect localStorage data
- View cookies and sessions

### Terminal Console

Watch the terminal where you ran `npm run dev` for:
- Main process logs
- Renderer console messages (mirrored)
- Error messages
- Hot reload notifications

## 🎨 Making UI Changes

### Example Workflow: Changing a Button Color

1. **Start dev mode**:
   ```bash
   npm run dev
   ```

2. **Open the HTML file** (e.g., `src/renderer/pages/kanban_board.html`)

3. **Find the button** you want to change

4. **Modify the CSS**:
   ```css
   /* Change from */
   .btn-primary {
       background: #007acc;
   }

   /* To */
   .btn-primary {
       background: #ff6b6b;
   }
   ```

5. **Save the file** (Ctrl/Cmd + S)

6. **See the change instantly** in the app window! 🎉

### Live CSS Editing

**Method 1: In DevTools**
- Right-click element → Inspect
- Modify CSS in Styles panel
- Changes apply immediately (but lost on reload)
- Copy final CSS back to your file

**Method 2: In Source Files**
- Edit CSS in your HTML file
- Save
- electron-reload refreshes automatically

## 🔄 Workflow for Different Changes

### Frontend UI Changes (HTML/CSS)
```
1. Edit HTML/CSS file
2. Save (Ctrl+S)
3. See changes instantly ✅
```

### Frontend JavaScript Changes
```
1. Edit JS in <script> tags or external .js
2. Save (Ctrl+S)
3. Page reloads automatically ✅
```

### Backend/Service Changes
```
1. Edit main.js or service files
2. Save (Ctrl+S)
3. Quit app (Ctrl+C in terminal)
4. Restart: npm run dev
```

**OR** use `npm run dev:watch` which does steps 3-4 automatically!

## 🐛 Debugging Tips

### Problem: Changes not appearing

**Solution 1: Hard reload**
- Press `Ctrl/Cmd + Shift + R` in the app

**Solution 2: Clear cache**
- DevTools → Application → Clear Storage → Clear site data

**Solution 3: Check the file path**
- Verify you're editing the correct file
- Check terminal for error messages

### Problem: App crashes on startup

**Check terminal output** for error messages:
```
❌ Failed to load: ...
```

**Common causes**:
- Syntax error in JavaScript
- Missing dependency
- Incorrect file path

**Solution**:
- Fix the error shown in terminal
- Restart: `npm run dev`

### Problem: "electron-reload not available"

**Install it**:
```bash
npm install --save-dev electron-reload
```

Then restart: `npm run dev`

## 📊 Monitoring Changes

### Terminal Output (npm run dev)
```
🚀 Starting Alternassist in DEVELOPMENT mode
📁 Project root: /path/to/alternassist
🔥 Hot reload active - save any file to reload
🔧 DevTools will open automatically
⌨️  Keyboard shortcuts:
   - Ctrl/Cmd + R: Reload
   - Ctrl/Cmd + Shift + I: Toggle DevTools
   - Ctrl/Cmd + Q: Quit
```

### When You Save a File
```
🔄 File changed: src/renderer/pages/kanban_board.html
🔄 Reloading page...
```

### Renderer Console Logs
All `console.log()` from your pages appear in terminal:
```
[Renderer Console] Project saved successfully
[Renderer Console] Estimate calculated: $8,450
```

## 🎯 Best Practices

### 1. Keep DevTools Open
- See errors immediately
- Test CSS changes live
- Inspect localStorage data

### 2. Watch the Terminal
- Catch errors early
- Monitor reload events
- See main process logs

### 3. Make Small Changes
- Change one thing at a time
- Save frequently
- See results immediately

### 4. Use Browser DevTools Skills
- Inspect elements
- Edit CSS live
- Test JavaScript in console

### 5. Test Across Modules
- Navigate between pages
- Verify data persistence
- Check for regressions

## 🚦 Development vs Production

### Development Mode (`npm run dev`)
- ✅ DevTools open
- ✅ Hot reload enabled
- ✅ Verbose logging
- ✅ Source maps available
- ⚠️  Slower startup

### Production Mode (`npm start`)
- ❌ No DevTools
- ❌ No hot reload
- ❌ Minimal logging
- ✅ Faster startup
- ✅ Optimized performance

## 🔥 Hot Reload Configuration

Hot reload watches these directories:
```
src/
├── renderer/
│   ├── pages/      ✅ Watched
│   ├── assets/     ✅ Watched
│   └── utils/      ✅ Watched
└── main/
    ├── main.js     ⚠️ Requires restart
    └── services/   ⚠️ Requires restart
```

Ignored (not watched):
```
node_modules/   ❌
dist/           ❌
.git/           ❌
logs/           ❌
*.log           ❌
```

## 🎓 Common Scenarios

### Scenario 1: Tweaking Button Styles
```bash
npm run dev
# Edit src/renderer/pages/kanban_board.html
# Change button CSS
# Save → See changes instantly ✅
```

### Scenario 2: Adding a New Feature
```bash
npm run dev
# Add HTML for new feature
# Add JavaScript event handlers
# Add CSS styling
# Save each file → See changes build up ✅
```

### Scenario 3: Fixing a Calculation Bug
```bash
npm run dev:watch
# Edit src/main/services/calculation.service.js
# Save → App restarts automatically
# Test the fix in UI ✅
```

### Scenario 4: Debugging localStorage Issues
```bash
npm run dev
# DevTools → Application → Local Storage
# View current data
# Clear if needed
# Test with fresh data ✅
```

## 📝 Quick Command Reference

```bash
# Start with hot reload (UI changes)
npm run dev

# Start with auto-restart (ALL changes)
npm run dev:watch

# Start with verbose logging
npm run dev:verbose

# Production mode (no dev tools)
npm start

# Build for distribution
npm run build

# Format code
npm run format
```

## 🎉 You're Ready!

Run `npm run dev` and start making changes. Save any file and watch the magic happen! 🚀

---

**Need Help?**
- Check terminal output for errors
- Open DevTools (Ctrl/Cmd + Shift + I)
- Review error messages carefully
- Changes not showing? Try Ctrl/Cmd + Shift + R for hard reload
