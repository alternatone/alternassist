# Cloudflare Pages + D1 Deployment Guide

Follow these steps to deploy your Alternassist backend to Cloudflare.

## Prerequisites

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
```

### 2. Login to Cloudflare

```bash
wrangler login
```

This will open a browser window to authenticate with your Cloudflare account.

---

## Deployment Steps

### Step 1: Create D1 Database

```bash
wrangler d1 create alternassist
```

**Expected output:**
```
✅ Successfully created DB 'alternassist'
binding = "DB"
database_id = "abc123-def456-ghi789..."
```

### Step 2: Update wrangler.toml

Copy the `database_id` from Step 1 output and update line 8 in `wrangler.toml`:

```toml
database_id = "YOUR_DATABASE_ID_HERE"
```

### Step 3: Apply Database Schema

```bash
wrangler d1 execute alternassist --file=migrations/0001_initial_schema.sql
```

**Expected output:**
```
🌀 Executing on remote database alternassist (abc123...):
🌀 To execute on your local development database, pass the --local flag
✅ Executed 0001_initial_schema.sql
```

This creates:
- 13 tables
- 14 indexes
- 3 triggers

### Step 4: Test Locally (Optional but Recommended)

```bash
wrangler pages dev public
```

**Expected output:**
```
⎔ Starting local server...
⎔ Listening on http://localhost:8788
```

Visit `http://localhost:8788` and test:
- Kanban board
- Projects list
- API endpoints

Press `Ctrl+C` to stop the local server.

### Step 5: Deploy to Cloudflare Pages

```bash
wrangler pages deploy public
```

**Expected output:**
```
✨ Success! Uploaded 1 file (X.XX sec)

✨ Deployment complete! Take a peek over at https://alternassist-xyz.pages.dev
```

---

## Verify Deployment

After deployment, test these endpoints:

1. **Projects API:**
   ```
   https://YOUR-PROJECT.pages.dev/api/projects
   ```

2. **Estimates API:**
   ```
   https://YOUR-PROJECT.pages.dev/api/estimates
   ```

3. **Visit the frontend:**
   ```
   https://YOUR-PROJECT.pages.dev/kanban_board.html
   ```

---

## Troubleshooting

### Database Connection Errors

If you see database errors, verify:

```bash
# List your D1 databases
wrangler d1 list

# Verify the database_id matches in wrangler.toml
cat wrangler.toml | grep database_id
```

### API 404 Errors

Pages Functions automatically route `/api/*` to `functions/api/*`. If you get 404s:

1. Check the file exists: `functions/api/projects/index.js`
2. Verify the function exports `onRequestGet`, `onRequestPost`, etc.
3. Check Cloudflare Pages dashboard for deployment logs

### Local Development Issues

If `wrangler pages dev` fails:

```bash
# Use --local flag for D1 to use local database
wrangler pages dev public --d1=DB=alternassist --local

# Or specify port if 8788 is in use
wrangler pages dev public --port=8789
```

---

## What's Working vs. Not Working

### ✅ Working (Database Operations)
- Projects CRUD
- Invoices & Payments
- Estimates & Scope
- Cues management
- Hours logging
- Accounting records
- File comments

### ⚠️ Requires R2 Integration (Not Yet Implemented)
- File upload
- File download
- Video/Audio streaming

See `functions/api/files/_README.md` for R2 implementation guide.

---

## Environment Variables (Optional)

Add environment variables via Cloudflare dashboard:
1. Go to Pages project settings
2. Navigate to "Settings" → "Environment variables"
3. Add variables for different environments (production, preview)

Or via CLI:

```bash
wrangler pages secret put SECRET_NAME
```

---

## Updating Your Deployment

When you make code changes:

```bash
# Commit your changes
git add .
git commit -m "Your changes"

# Redeploy
wrangler pages deploy public
```

Database schema changes:

```bash
# Create new migration file
# migrations/0002_your_changes.sql

# Apply to production
wrangler d1 execute alternassist --file=migrations/0002_your_changes.sql
```

---

## Need Help?

- **Cloudflare Docs:** https://developers.cloudflare.com/pages/
- **D1 Documentation:** https://developers.cloudflare.com/d1/
- **Wrangler CLI:** https://developers.cloudflare.com/workers/wrangler/

---

## Quick Reference

```bash
# Create database
wrangler d1 create alternassist

# Update wrangler.toml with database_id

# Apply schema
wrangler d1 execute alternassist --file=migrations/0001_initial_schema.sql

# Test locally
wrangler pages dev public

# Deploy
wrangler pages deploy public
```

That's it! 🚀
