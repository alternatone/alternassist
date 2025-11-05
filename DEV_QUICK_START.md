# 🚀 Quick Start - Development Mode

## One Command to Start
```bash
npm run dev
```

## What Happens

```
Terminal                        App Window
┌─────────────────────┐        ┌──────────────────────┐
│ $ npm run dev       │        │                      │
│                     │        │   Alternassist       │
│ 🚀 Starting...      │        │   ┌────────────────┐ │
│ 🔥 Hot reload ON    │───────▶│   │ Your App       │ │
│ 🔧 DevTools open    │        │   │                │ │
│                     │        │   │ [Button]       │ │
│ Watching files...   │        │   └────────────────┘ │
│                     │        │                      │
│                     │        │   DevTools (opens    │
│                     │        │   automatically)     │
│                     │        │   ┌────────────────┐ │
│                     │        │   │ Console  │ Elem││
│                     │        │   │ Network  │ ... ││
│                     │        │   └────────────────┘ │
└─────────────────────┘        └──────────────────────┘
```

## Make a Change

```
1. Edit File                   2. Save File              3. See Result
┌─────────────────────┐       ┌─────────────────────┐  ┌──────────────────────┐
│ kanban_board.html   │       │ Press Ctrl+S        │  │ App Updates!         │
│                     │       │                     │  │                      │
│ <button style=      │       │ ✅ Saved!           │  │ ✨ Button is now red │
│   "background:      │       │                     │  │                      │
│    red">           │       │ Terminal shows:     │  │ (instant update)     │
│ </button>           │──────▶│ 🔄 File changed    │─▶│                      │
│                     │       │ 🔄 Reloading...    │  │                      │
└─────────────────────┘       └─────────────────────┘  └──────────────────────┘
```

## File Watch Behavior

| File Type | What Happens | Speed |
|-----------|-------------|-------|
| HTML/CSS | Instant reload | ⚡ 0.5s |
| Client JS | Instant reload | ⚡ 0.5s |
| Services | Needs restart | 🐢 3s |

## Three Ways to Develop

### 🎨 UI Work (HTML/CSS)
```bash
npm run dev
```
→ Instant reload when you save
→ Perfect for styling and layout

### ⚙️ Backend Work (Services)
```bash
npm run dev:watch
```
→ Auto-restarts on ANY change
→ Slower but handles everything

### 🔍 Debugging
```bash
npm run dev:verbose
```
→ See all logs
→ Track down issues

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+R` | Reload page |
| `Ctrl+Shift+R` | Hard reload |
| `Ctrl+Shift+I` | Toggle DevTools |
| `Ctrl+C` (terminal) | Stop app |

## Common Tasks

### Change Button Color
1. Open `src/renderer/pages/kanban_board.html`
2. Find the button
3. Change `background: #007acc` to `background: #ff6b6b`
4. Save (Ctrl+S)
5. See it change instantly! ✨

### Add New Feature
1. Start `npm run dev`
2. Edit HTML to add UI elements
3. Add JavaScript for functionality
4. Add CSS for styling
5. Save each file → see changes build up

### Debug an Issue
1. Start `npm run dev`
2. Open DevTools (auto-opens)
3. Check Console for errors
4. Use Elements tab to inspect
5. Fix in your editor
6. Save → see fix apply

## Need Help?

**Changes not showing?**
→ Press `Ctrl+Shift+R` for hard reload

**App won't start?**
→ Check terminal for errors
→ Run `npm install` again

**Want to learn more?**
→ Read [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md)

---

**That's it! Save this file and run `npm run dev` to start developing! 🎉**
