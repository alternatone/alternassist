const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db, fileQueries } = require('../models/database');
const { requireAdmin } = require('../middleware/auth');
const config = require('../../alternaview-config');

// Get the correct app base path (handles packaged Electron apps)
function getAppPath() {
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) {
      return app.getAppPath();
    }
  } catch (e) {
    // Not running in Electron
  }
  return path.join(__dirname, '../..');
}

const APP_PATH = getAppPath();

const router = express.Router();

// Prepared statements for share links
const shareQueries = {
  create: db.prepare(`
    INSERT INTO share_links (token, project_id, expires_at, password_hash, created_by)
    VALUES (?, ?, ?, ?, ?)
  `),

  findByToken: db.prepare(`
    SELECT * FROM share_links WHERE token = ?
  `),

  updateAccessCount: db.prepare(`
    UPDATE share_links
    SET access_count = access_count + 1, last_accessed_at = unixepoch()
    WHERE token = ?
  `),

  listByProject: db.prepare(`
    SELECT * FROM share_links WHERE project_id = ? ORDER BY created_at DESC
  `),

  delete: db.prepare(`
    DELETE FROM share_links WHERE token = ?
  `),

  deleteExpired: db.prepare(`
    DELETE FROM share_links WHERE expires_at IS NOT NULL AND expires_at < unixepoch()
  `)
};

/**
 * Generate Share Link (Admin only)
 * POST /api/share/generate
 * Supports both project_id and file_id
 */
router.post('/generate', async (req, res) => {
  try {
    console.log('[SHARE] POST /generate request body:', req.body);
    const { project_id, file_id, ftp_path, expires_in, password, type } = req.body;
    const linkType = type === 'upload' ? 'upload' : 'download';

    if (!project_id && !file_id && !ftp_path) {
      return res.status(400).json({ error: 'project_id, file_id, or ftp_path is required' });
    }

    // Upload links require an ftp_path (the TO AA folder)
    if (linkType === 'upload' && !ftp_path) {
      return res.status(400).json({ error: 'ftp_path is required for upload links' });
    }

    // Verify project or file exists
    if (project_id) {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
    }

    if (file_id) {
      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(file_id);
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }
    }

    // FTP path validation (if provided)
    if (ftp_path) {
      // Basic validation - ensure it's a non-empty string
      if (typeof ftp_path !== 'string' || !ftp_path.trim()) {
        return res.status(400).json({ error: 'Invalid FTP path' });
      }
      // For upload links, verify the directory exists on disk
      if (linkType === 'upload') {
        // Strip leading slashes so path.resolve joins correctly with storagePath
        const cleanPath = ftp_path.replace(/^\/+/, '');
        const resolved = path.resolve(config.storagePath, path.normalize(cleanPath));
        if (!resolved.startsWith(config.storagePath)) {
          return res.status(400).json({ error: 'Invalid FTP path' });
        }
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
          return res.status(400).json({ error: 'Upload target folder does not exist' });
        }
      }
    }

    // Generate secure token
    const token = crypto.randomBytes(16).toString('hex');

    // Calculate expiry
    let expiresAt = null;
    if (expires_in && expires_in !== 'never') {
      const expirySeconds = parseExpiry(expires_in);
      expiresAt = Math.floor(Date.now() / 1000) + expirySeconds;
    }

    // Hash password if provided
    let passwordHash = null;
    if (password && password.trim()) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Create share link with project_id, file_id, or ftp_path
    db.prepare(`
      INSERT INTO share_links (token, project_id, file_id, ftp_path, expires_at, password_hash, created_by, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      token,
      project_id || null,
      file_id || null,
      ftp_path || null,
      expiresAt,
      passwordHash,
      null,  // No admin session available yet
      linkType
    );

    const url = `https://alternassist.alternatone.com/share/${token}`;

    const logType = project_id ? `project ${project_id}` : file_id ? `file ${file_id}` : `ftp_path ${ftp_path}`;
    console.log(`[SHARE] Generated share link for ${logType} (expires: ${expiresAt || 'never'}, password: ${passwordHash ? 'yes' : 'no'})`);

    res.json({
      success: true,
      url,
      token,
      expires_at: expiresAt,
      has_password: !!passwordHash
    });
  } catch (error) {
    console.error('[SHARE] Error generating share link:', error);
    console.error('[SHARE] Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to generate share link', details: error.message });
  }
});

/**
 * Access Share Link (Public)
 * GET /share/:token
 */
router.get('/:token', (req, res) => {
  try {
    const { token } = req.params;

    // Clean up expired links
    shareQueries.deleteExpired.run();

    // Find link
    const link = shareQueries.findByToken.get(token);

    if (!link) {
      return res.status(404).send('Share link not found or has expired');
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (link.expires_at !== null && link.expires_at < now) {
      return res.status(410).send('This share link has expired');
    }

    // Check if password protected
    if (link.password_hash) {
      // Check if already authenticated for this link
      if (req.session[`share_${token}`] === true) {
        // Already authenticated, redirect to project
        return redirectToProject(link, res);
      }

      // Show password prompt page
      return res.send(renderPasswordPrompt(token));
    }

    // No password required, redirect to project
    redirectToProject(link, res);
  } catch (error) {
    console.error('Error accessing share link:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Verify Share Link Password (Public)
 * POST /share/:token/auth
 */
router.post('/:token/auth', express.json(), async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const link = shareQueries.findByToken.get(token);

    if (!link) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    if (!link.password_hash) {
      return res.status(400).json({ error: 'This link does not require a password' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, link.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Set session flag for this share link
    req.session[`share_${token}`] = true;

    // Update access count
    shareQueries.updateAccessCount.run(token);

    res.json({ success: true });
  } catch (error) {
    console.error('Error verifying share link password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * List Share Links for Project (Admin only)
 * GET /api/share/project/:projectId
 */
router.get('/project/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;

    const links = shareQueries.listByProject.all(projectId);

    // Clean up expired links
    shareQueries.deleteExpired.run();

    res.json(links);
  } catch (error) {
    console.error('Error listing share links:', error);
    res.status(500).json({ error: 'Failed to list share links' });
  }
});

/**
 * Delete Share Link (Admin only)
 * DELETE /api/share/:token
 */
router.delete('/:token', (req, res) => {
  try {
    const { token } = req.params;

    shareQueries.delete.run(token);

    console.log(`[SHARE] Deleted share link ${token}`);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting share link:', error);
    res.status(500).json({ error: 'Failed to delete share link' });
  }
});

// Helper functions

function parseExpiry(expiryString) {
  const units = {
    'd': 24 * 60 * 60,      // days
    'h': 60 * 60,           // hours
    'm': 60                 // minutes
  };

  const match = expiryString.match(/^(\d+)([dhm])$/);
  if (!match) return 7 * 24 * 60 * 60;  // Default 7 days

  const [, amount, unit] = match;
  return parseInt(amount) * units[unit];
}

function redirectToProject(link, res) {
  console.log('[SHARE] redirectToProject called with link:', JSON.stringify(link));
  // Update access count
  shareQueries.updateAccessCount.run(link.token);

  // Upload links get the upload page
  if (link.type === 'upload') {
    return res.send(renderUploadPage(link.token, link));
  }

  // Redirect based on link type
  if (link.project_id) {
    // Project share link
    res.redirect(`/client/login.html?share=${link.token}&project=${link.project_id}`);
  } else if (link.file_id || link.ftp_path) {
    // File share link - serve public viewer with title pre-set
    let fileName = 'Video Review';

    if (link.file_id) {
      // Get filename from database
      const file = fileQueries.findById.get(link.file_id);
      if (file) {
        fileName = file.original_name;
      }
    } else if (link.ftp_path) {
      // Extract filename from path
      fileName = link.ftp_path.split('/').pop();
    }

    // Read the public viewer HTML and inject the title
    const viewerPath = path.join(APP_PATH, 'public/public_viewer.html');
    let html = fs.readFileSync(viewerPath, 'utf8');

    // Replace title and og:title
    const safeTitle = fileName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/<title>Video Review<\/title>/, `<title>${safeTitle} - Alternassist</title>`);
    html = html.replace(/content="Video Review"/, `content="${safeTitle} - Alternassist"`);

    // Inject the file parameters as a script so the page knows what to load
    let params;
    if (link.file_id) {
      // Get project ID from the file
      const file = fileQueries.findById.get(link.file_id);
      const projectIdParam = file ? `window.SHARE_PROJECT_ID = ${file.project_id};` : '';
      params = `window.SHARE_FILE_ID = ${link.file_id}; ${projectIdParam}`;
    } else {
      params = `window.SHARE_FTP_PATH = "${link.ftp_path.replace(/"/g, '\\"')}";`;
    }
    html = html.replace('</head>', `<script>${params}</script></head>`);

    res.send(html);
  } else {
    res.status(500).send('Invalid share link configuration');
  }
}

// Secure path sanitization (same as ftp-browser.js)
function sanitizePath(userPath) {
  // Strip leading slashes so path.resolve joins correctly with storagePath
  const cleaned = (userPath || '').replace(/^\/+/, '');
  const normalized = path.normalize(cleaned);
  const resolved = path.resolve(config.storagePath, normalized);
  if (!resolved.startsWith(config.storagePath)) {
    throw new Error('Invalid path - access denied');
  }
  return resolved;
}

function renderPasswordPrompt(token) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Required - Alternassist</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Bricolage+Grotesque:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary-text: #1a1a1a;
            --secondary-text: #333;
            --subtle-text: #666;
            --accent-blue: #007acc;
            --bg-primary: #FDF8F0;
            --bg-secondary: #FEFDFA;
            --shadow-subtle: 0 4px 20px rgba(0,0,0,0.05);
            --border-medium: 1px solid #e8e8e8;
            --font-primary: 'DM Sans', system-ui, -apple-system, sans-serif;
            --font-display: 'Bricolage Grotesque', system-ui, sans-serif;
            --radius-lg: 12px;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--font-primary);
            background: var(--bg-primary);
            color: var(--primary-text);
            line-height: 1.6;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 2rem;
        }

        .container {
            background: var(--bg-secondary);
            border-radius: var(--radius-lg);
            padding: 3rem;
            width: 100%;
            max-width: 420px;
            box-shadow: var(--shadow-subtle);
            border: 1px solid #f0f0f0;
        }

        .logo {
            font-family: var(--font-display);
            font-size: 2rem;
            font-weight: 400;
            text-align: center;
            margin-bottom: 0.5rem;
            letter-spacing: -0.02em;
        }

        .subtitle {
            text-align: center;
            color: var(--subtle-text);
            font-size: 0.95rem;
            margin-bottom: 2.5rem;
        }

        .form-group {
            margin-bottom: 1.5rem;
        }

        .form-group label {
            display: block;
            font-weight: 500;
            margin-bottom: 0.5rem;
            color: var(--secondary-text);
            font-size: 0.95rem;
        }

        .form-group input {
            width: 100%;
            padding: 0.875rem 1rem;
            border: var(--border-medium);
            border-radius: 8px;
            font-size: 1rem;
            font-family: var(--font-primary);
            transition: all 0.2s;
            background: white;
        }

        .form-group input:focus {
            outline: none;
            border-color: var(--accent-blue);
            box-shadow: 0 0 0 3px rgba(0, 122, 204, 0.1);
        }

        .btn {
            width: 100%;
            padding: 1rem;
            background: var(--accent-blue);
            color: white;
            border: none;
            border-radius: 8px;
            font-family: var(--font-primary);
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            margin-top: 0.5rem;
        }

        .btn:hover {
            background: #006bb3;
        }

        .btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .error-message {
            background: #fff5f5;
            border: 1px solid #feb2b2;
            color: #c53030;
            padding: 0.875rem 1rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
            font-size: 0.9rem;
            display: none;
        }

        .error-message.show {
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">Alternassist</div>
        <div class="subtitle">Password Protected Link</div>

        <div id="errorMessage" class="error-message"></div>

        <form id="passwordForm">
            <div class="form-group">
                <label for="password">Enter Password</label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    autocomplete="off"
                    required
                    autofocus
                >
            </div>

            <button type="submit" class="btn" id="submitBtn">Continue</button>
        </form>
    </div>

    <script>
        const form = document.getElementById('passwordForm');
        const submitBtn = document.getElementById('submitBtn');
        const errorMessage = document.getElementById('errorMessage');
        const token = '${token}';

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            errorMessage.classList.remove('show');

            const password = document.getElementById('password').value;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Verifying...';

            try {
                const response = await fetch(\`/share/\${token}/auth\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ password }),
                    credentials: 'include'
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    // Password correct, reload to access project
                    window.location.reload();
                } else {
                    errorMessage.textContent = data.error || 'Invalid password';
                    errorMessage.classList.add('show');
                }
            } catch (error) {
                console.error('Error:', error);
                errorMessage.textContent = 'Connection error. Please try again.';
                errorMessage.classList.add('show');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Continue';
            }
        });
    </script>
</body>
</html>
  `;
}

/**
 * Upload file via share link (Public)
 * POST /share/:token/upload
 */
/**
 * Chunked upload - receive individual chunks
 * POST /share/:token/upload
 *
 * Supports two modes:
 * 1. Small files (< 50MB): single request, no chunk headers needed
 * 2. Large files: chunked, with headers x-chunk-index, x-total-chunks, x-upload-id, x-filename, x-filesize
 */
router.post('/:token/upload', (req, res) => {
  try {
    const { token } = req.params;

    // Clean up expired links
    shareQueries.deleteExpired.run();

    const link = shareQueries.findByToken.get(token);

    if (!link) {
      return res.status(404).json({ error: 'Upload link not found or has expired' });
    }

    if (link.type !== 'upload') {
      return res.status(400).json({ error: 'This is not an upload link' });
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (link.expires_at !== null && link.expires_at < now) {
      return res.status(410).json({ error: 'This upload link has expired' });
    }

    // Check password authentication if required
    if (link.password_hash && req.session[`share_${token}`] !== true) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Resolve the upload destination
    let destPath;
    try {
      destPath = sanitizePath(link.ftp_path);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid upload destination' });
    }

    if (!fs.existsSync(destPath) || !fs.statSync(destPath).isDirectory()) {
      return res.status(400).json({ error: 'Upload destination folder not found' });
    }

    // Determine if this is a chunked upload based on headers
    const chunkIndex = parseInt(req.headers['x-chunk-index']);
    const totalChunks = parseInt(req.headers['x-total-chunks']);
    const uploadId = req.headers['x-upload-id'];
    const origFilename = req.headers['x-filename'] ? decodeURIComponent(req.headers['x-filename']) : null;
    const fileSize = parseInt(req.headers['x-filesize']);
    const isChunked = !isNaN(chunkIndex) && !isNaN(totalChunks) && uploadId && origFilename;

    if (isChunked) {
      // === CHUNKED UPLOAD MODE ===
      // Validate filename is a ZIP
      if (path.extname(origFilename).toLowerCase() !== '.zip') {
        return res.status(400).json({ error: 'Only ZIP files are allowed' });
      }

      // Sanitize uploadId to prevent path traversal
      const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeUploadId) {
        return res.status(400).json({ error: 'Invalid upload ID' });
      }

      // Create temp directory for chunks
      const tempDir = path.join(destPath, '.upload-chunks', safeUploadId);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Store the chunk using multer
      const chunkStorage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, tempDir),
        filename: (req, file, cb) => cb(null, `chunk-${chunkIndex}`)
      });

      const chunkUpload = multer({ storage: chunkStorage }).single('chunk');

      chunkUpload(req, res, (err) => {
        if (err) {
          console.error('[SHARE] Chunk upload error:', err.message);
          return res.status(400).json({ error: err.message });
        }

        if (!req.file) {
          return res.status(400).json({ error: 'No chunk data received' });
        }

        console.log(`[SHARE] Chunk ${chunkIndex + 1}/${totalChunks} received for ${origFilename} (${formatBytes(req.file.size)})`);

        // Check if all chunks have arrived
        const receivedChunks = fs.readdirSync(tempDir).filter(f => f.startsWith('chunk-')).length;

        if (receivedChunks === totalChunks) {
          // All chunks received — reassemble the file
          console.log(`[SHARE] All ${totalChunks} chunks received for ${origFilename}, reassembling...`);

          try {
            // Determine final filename (avoid conflicts)
            const ext = path.extname(origFilename);
            const base = path.basename(origFilename, ext);
            let finalName = origFilename;
            if (fs.existsSync(path.join(destPath, finalName))) {
              finalName = `${base}-${Date.now()}${ext}`;
            }
            const finalPath = path.join(destPath, finalName);

            // Reassemble chunks in order using streaming (handles multi-GB files)
            async function reassembleChunks() {
              const writeStream = fs.createWriteStream(finalPath);
              for (let i = 0; i < totalChunks; i++) {
                const chunkPath = path.join(tempDir, `chunk-${i}`);
                await new Promise((resolve, reject) => {
                  const readStream = fs.createReadStream(chunkPath);
                  readStream.pipe(writeStream, { end: false });
                  readStream.on('end', resolve);
                  readStream.on('error', reject);
                });
              }
              writeStream.end();
              return new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
              });
            }

            reassembleChunks().then(() => {
              const finalSize = fs.statSync(finalPath).size;
              console.log(`[SHARE] Reassembled ${finalName} (${formatBytes(finalSize)}) to ${link.ftp_path}`);

              // Clean up temp chunks
              try {
                fs.rmSync(tempDir, { recursive: true, force: true });
                // Remove .upload-chunks dir if empty
                const chunksParent = path.join(destPath, '.upload-chunks');
                if (fs.existsSync(chunksParent) && fs.readdirSync(chunksParent).length === 0) {
                  fs.rmdirSync(chunksParent);
                }
              } catch (cleanErr) {
                console.error('[SHARE] Chunk cleanup error:', cleanErr);
              }

              // Update access count
              shareQueries.updateAccessCount.run(token);

              // Log to access_logs
              try {
                if (link.project_id) {
                  db.prepare('INSERT INTO access_logs (project_id, action, ip_address) VALUES (?, ?, ?)')
                    .run(
                      link.project_id,
                      `upload_via_link: ${origFilename} (${formatBytes(finalSize)})`,
                      req.ip || req.connection?.remoteAddress || 'unknown'
                    );
                }
              } catch (logError) {
                console.error('[SHARE] Access log error:', logError);
              }

              res.json({
                success: true,
                complete: true,
                file: {
                  name: finalName,
                  originalName: origFilename,
                  size: finalSize
                }
              });
            }).catch((writeErr) => {
              console.error('[SHARE] File reassembly error:', writeErr);
              res.status(500).json({ error: 'Failed to reassemble file' });
            });
          } catch (assembleErr) {
            console.error('[SHARE] Assembly error:', assembleErr);
            res.status(500).json({ error: 'Failed to reassemble file' });
          }
        } else {
          // Not all chunks yet — acknowledge this chunk
          res.json({
            success: true,
            complete: false,
            chunksReceived: receivedChunks,
            totalChunks: totalChunks
          });
        }
      });
    } else {
      // === SINGLE FILE MODE (small files) ===
      const storage = multer.diskStorage({
        destination: (req, file, cb) => {
          cb(null, destPath);
        },
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname);
          const base = path.basename(file.originalname, ext);
          const targetPath = path.join(destPath, file.originalname);

          if (fs.existsSync(targetPath)) {
            const timestamp = Date.now();
            cb(null, `${base}-${timestamp}${ext}`);
          } else {
            cb(null, file.originalname);
          }
        }
      });

      const upload = multer({
        storage,
        fileFilter: (req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          if (ext !== '.zip') {
            cb(new Error('Only ZIP files are allowed'));
            return;
          }
          cb(null, true);
        }
      }).single('file');

      upload(req, res, (err) => {
        if (err) {
          console.error('[SHARE] Upload error:', err.message);
          return res.status(400).json({ error: err.message });
        }

        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        // Update access count
        shareQueries.updateAccessCount.run(token);

        // Log to access_logs
        try {
          if (link.project_id) {
            db.prepare('INSERT INTO access_logs (project_id, action, ip_address) VALUES (?, ?, ?)')
              .run(
                link.project_id,
                `upload_via_link: ${req.file.originalname} (${formatBytes(req.file.size)})`,
                req.ip || req.connection?.remoteAddress || 'unknown'
              );
          }
        } catch (logError) {
          console.error('[SHARE] Access log error:', logError);
        }

        console.log(`[SHARE] File uploaded via link: ${req.file.originalname} (${req.file.size} bytes) to ${link.ftp_path}`);

        res.json({
          success: true,
          complete: true,
          file: {
            name: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size
          }
        });
      });
    }
  } catch (error) {
    console.error('[SHARE] Upload endpoint error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function renderUploadPage(token, link) {
  const folderName = link.ftp_path ? link.ftp_path.split('/').filter(p => p).pop() : 'Upload';
  const safeFolder = folderName.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Upload Files - Alternassist</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Bricolage+Grotesque:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary-text: #1a1a1a;
            --secondary-text: #333;
            --subtle-text: #666;
            --muted-text: #999;
            --accent-blue: #007acc;
            --accent-green: #51cf66;
            --accent-red: #ff6b6b;
            --bg-primary: #FDF8F0;
            --bg-secondary: #FEFDFA;
            --shadow-subtle: 0 4px 20px rgba(0,0,0,0.05);
            --border-medium: 1px solid #e8e8e8;
            --border-light: 1px solid #f0f0f0;
            --font-primary: 'DM Sans', system-ui, -apple-system, sans-serif;
            --font-display: 'Bricolage Grotesque', system-ui, sans-serif;
            --font-mono: 'SF Mono', 'Menlo', monospace;
            --radius-lg: 12px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--font-primary);
            background: var(--bg-primary);
            color: var(--primary-text);
            line-height: 1.6;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 2rem;
        }

        .container {
            background: var(--bg-secondary);
            border-radius: var(--radius-lg);
            padding: 2.5rem;
            width: 100%;
            max-width: 560px;
            box-shadow: var(--shadow-subtle);
            border: 1px solid #f0f0f0;
        }

        .logo {
            font-family: var(--font-display);
            font-size: 2rem;
            font-weight: 400;
            text-align: center;
            margin-bottom: 0.25rem;
            letter-spacing: -0.02em;
        }

        .subtitle {
            text-align: center;
            color: var(--subtle-text);
            font-size: 0.95rem;
            margin-bottom: 2rem;
        }

        .drop-zone {
            border: 2px dashed #d0d0d0;
            border-radius: var(--radius-lg);
            padding: 3rem 2rem;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
            background: white;
            position: relative;
        }

        .drop-zone:hover {
            border-color: var(--accent-blue);
            background: rgba(0, 122, 204, 0.02);
        }

        .drop-zone.drag-over {
            border-color: var(--accent-blue);
            background: rgba(0, 122, 204, 0.05);
            border-style: solid;
        }

        .drop-zone-icon {
            color: var(--muted-text);
            margin-bottom: 1rem;
        }

        .drop-zone-text {
            color: var(--subtle-text);
            font-size: 1rem;
            margin-bottom: 0.25rem;
        }

        .drop-zone-hint {
            color: var(--muted-text);
            font-size: 0.85rem;
        }

        .drop-zone-hint a {
            color: var(--accent-blue);
            cursor: pointer;
            text-decoration: none;
        }

        .drop-zone-hint a:hover {
            text-decoration: underline;
        }

        .file-input {
            display: none;
        }

        .file-list {
            margin-top: 1.5rem;
        }

        .file-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            background: white;
            border: var(--border-light);
            border-radius: 8px;
            margin-bottom: 0.5rem;
        }

        .file-item-icon {
            color: var(--accent-blue);
            flex-shrink: 0;
        }

        .file-item-info {
            flex: 1;
            min-width: 0;
        }

        .file-item-name {
            font-weight: 500;
            font-size: 0.9rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .file-item-size {
            font-size: 0.8rem;
            color: var(--muted-text);
            font-family: var(--font-mono);
        }

        .file-item-status {
            flex-shrink: 0;
            font-size: 0.8rem;
            font-weight: 500;
        }

        .file-item-remove {
            flex-shrink: 0;
            background: none;
            border: none;
            color: var(--muted-text);
            cursor: pointer;
            padding: 0.25rem;
            border-radius: 4px;
            transition: all 0.2s;
        }

        .file-item-remove:hover {
            color: var(--accent-red);
            background: rgba(255, 107, 107, 0.1);
        }

        .progress-container {
            margin-top: 0.5rem;
            width: 100%;
        }

        .progress-bar {
            width: 100%;
            height: 4px;
            background: #e8e8e8;
            border-radius: 2px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: var(--accent-blue);
            border-radius: 2px;
            transition: width 0.15s ease;
            width: 0%;
        }

        .progress-fill.complete {
            background: var(--accent-green);
        }

        .progress-fill.error {
            background: var(--accent-red);
        }

        .progress-text {
            font-size: 0.75rem;
            color: var(--muted-text);
            margin-top: 0.25rem;
            font-family: var(--font-mono);
        }

        .status-pending { color: var(--muted-text); }
        .status-uploading { color: var(--accent-blue); }
        .status-complete { color: var(--accent-green); }
        .status-error { color: var(--accent-red); }

        .btn-group {
            display: flex;
            gap: 0.5rem;
            margin-top: 1.5rem;
        }

        .btn {
            flex: 1;
            padding: 0.85rem 1rem;
            color: white;
            border: none;
            border-radius: 8px;
            font-family: var(--font-primary);
            font-size: 0.95rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
        }

        .btn-start {
            background: var(--accent-blue);
        }
        .btn-start:hover { background: #006bb3; }

        .btn-pause {
            background: #f59f00;
            flex: 0.5;
        }
        .btn-pause:hover { background: #e08e00; }

        .btn-cancel {
            background: var(--accent-red);
            flex: 0.5;
        }
        .btn-cancel:hover { background: #e55555; }

        .btn:disabled { background: #ccc; cursor: not-allowed; }

        .btn-group .btn.hidden { display: none; }

        .overall-progress {
            margin-top: 1.5rem;
            display: none;
        }

        .overall-progress.show { display: block; }

        .overall-progress-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
            font-size: 0.85rem;
            color: var(--subtle-text);
        }

        .overall-bar {
            width: 100%;
            height: 6px;
            background: #e8e8e8;
            border-radius: 3px;
            overflow: hidden;
        }

        .overall-fill {
            height: 100%;
            background: var(--accent-blue);
            border-radius: 3px;
            transition: width 0.3s ease;
            width: 0%;
        }

        .overall-fill.complete { background: var(--accent-green); }

        .success-message {
            text-align: center;
            padding: 1.5rem;
            color: var(--accent-green);
            font-weight: 500;
            display: none;
        }

        .success-message.show { display: block; }

        .error-banner {
            background: #fff5f5;
            border: 1px solid #feb2b2;
            color: #c53030;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            margin-top: 1rem;
            font-size: 0.9rem;
            display: none;
            position: relative;
        }

        .error-dismiss {
            float: right;
            cursor: pointer;
            font-size: 1.2rem;
            line-height: 1;
            margin-left: 0.5rem;
            opacity: 0.6;
        }

        .error-dismiss:hover { opacity: 1; }

        .error-banner.show { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">Alternassist</div>
        <div class="subtitle">Upload files to ${safeFolder}</div>

        <div id="dropZone" class="drop-zone">
            <div class="drop-zone-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
            </div>
            <div class="drop-zone-text">Drop ZIP files here</div>
            <div class="drop-zone-hint">or <a id="browseLink">browse to select</a></div>
        </div>

        <input type="file" id="fileInput" class="file-input" accept=".zip" multiple>

        <div id="fileList" class="file-list"></div>

        <div id="errorBanner" class="error-banner"></div>

        <div id="overallProgress" class="overall-progress">
            <div class="overall-progress-header">
                <span id="overallLabel">Uploading...</span>
                <span id="overallPercent">0%</span>
            </div>
            <div class="overall-bar">
                <div id="overallFill" class="overall-fill"></div>
            </div>
        </div>

        <div id="successMessage" class="success-message">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 0.5rem;">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <div>All files uploaded successfully!</div>
        </div>

        <div class="btn-group">
            <button id="startBtn" class="btn btn-start" disabled>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                Upload
            </button>
            <button id="pauseBtn" class="btn btn-pause hidden" disabled>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                Pause
            </button>
            <button id="cancelBtn" class="btn btn-cancel hidden" disabled>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                Cancel
            </button>
        </div>
    </div>

    <script>
        const TOKEN = '${token}';
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const browseLink = document.getElementById('browseLink');
        const fileListEl = document.getElementById('fileList');
        const startBtn = document.getElementById('startBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const errorBanner = document.getElementById('errorBanner');
        const overallProgress = document.getElementById('overallProgress');
        const overallLabel = document.getElementById('overallLabel');
        const overallPercent = document.getElementById('overallPercent');
        const overallFill = document.getElementById('overallFill');
        const successMessage = document.getElementById('successMessage');

        const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk (safe for slow connections through Cloudflare's 100s timeout)
        const MAX_RETRIES = 3;

        let filesToUpload = [];
        let isUploading = false;
        let isPaused = false;
        let isCancelled = false;
        let activeXHR = null; // current in-flight XHR for cancel/abort

        function formatSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function showError(msg) {
            errorBanner.innerHTML = msg + ' <span class="error-dismiss">&times;</span>';
            errorBanner.classList.add('show');
            errorBanner.querySelector('.error-dismiss').addEventListener('click', () => {
                errorBanner.classList.remove('show');
            });
        }

        // ---- UI State ----
        function showIdleUI() {
            startBtn.classList.remove('hidden');
            pauseBtn.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            startBtn.disabled = filesToUpload.filter(f => f.status === 'pending' || f.status === 'error').length === 0;
            startBtn.innerHTML = \`
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                Upload\`;
        }

        function showUploadingUI() {
            startBtn.classList.add('hidden');
            pauseBtn.classList.remove('hidden');
            cancelBtn.classList.remove('hidden');
            pauseBtn.disabled = false;
            cancelBtn.disabled = false;
            isPaused = false;
            pauseBtn.innerHTML = \`
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                Pause\`;
        }

        function showCompleteUI() {
            startBtn.classList.remove('hidden');
            pauseBtn.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            startBtn.disabled = false;
            startBtn.innerHTML = \`
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                Upload More Files\`;
        }

        // ---- Drag and drop ----
        dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            handleFiles(e.dataTransfer.files);
        });

        // Click to browse
        browseLink.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });

        function handleFiles(fileListInput) {
            if (isUploading) return;

            for (const file of fileListInput) {
                if (!file.name.toLowerCase().endsWith('.zip')) {
                    showError('Only ZIP files are allowed: ' + file.name);
                    continue;
                }
                if (filesToUpload.some(f => f.file.name === file.name && f.file.size === file.size)) {
                    continue;
                }
                filesToUpload.push({
                    file,
                    status: 'pending',
                    progress: 0,
                    error: null
                });
            }
            renderFileList();
            showIdleUI();
        }

        function removeFile(index) {
            if (isUploading) return;
            filesToUpload.splice(index, 1);
            renderFileList();
            showIdleUI();
        }

        function renderFileList() {
            fileListEl.innerHTML = filesToUpload.map((item, i) => {
                let statusHTML = '';
                let progressHTML = '';
                let removeHTML = '';

                if (item.status === 'pending') {
                    statusHTML = '<span class="file-item-status status-pending">Ready</span>';
                    removeHTML = \`<button class="file-item-remove" onclick="removeFile(\${i})" title="Remove">&times;</button>\`;
                } else if (item.status === 'uploading') {
                    statusHTML = '<span class="file-item-status status-uploading">' + item.progress + '%</span>';
                    progressHTML = \`
                        <div class="progress-container">
                            <div class="progress-bar"><div class="progress-fill" style="width: \${item.progress}%"></div></div>
                        </div>\`;
                } else if (item.status === 'paused') {
                    statusHTML = '<span class="file-item-status" style="color: #f59f00;">Paused</span>';
                    progressHTML = \`
                        <div class="progress-container">
                            <div class="progress-bar"><div class="progress-fill" style="width: \${item.progress}%; background: #f59f00;"></div></div>
                        </div>\`;
                } else if (item.status === 'complete') {
                    statusHTML = '<span class="file-item-status status-complete">Done</span>';
                    progressHTML = '<div class="progress-container"><div class="progress-bar"><div class="progress-fill complete" style="width: 100%"></div></div></div>';
                } else if (item.status === 'error') {
                    statusHTML = '<span class="file-item-status status-error">Failed</span>';
                    progressHTML = '<div class="progress-container"><div class="progress-bar"><div class="progress-fill error" style="width: 100%"></div></div><div class="progress-text">' + (item.error || 'Upload failed') + '</div></div>';
                } else if (item.status === 'cancelled') {
                    statusHTML = '<span class="file-item-status status-error">Cancelled</span>';
                }

                return \`
                    <div class="file-item">
                        <div class="file-item-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                        </div>
                        <div class="file-item-info">
                            <div class="file-item-name">\${item.file.name}</div>
                            <div class="file-item-size">\${formatSize(item.file.size)}</div>
                            \${progressHTML}
                        </div>
                        \${statusHTML}
                        \${removeHTML}
                    </div>\`;
            }).join('');
        }

        // ---- Button handlers ----
        startBtn.addEventListener('click', startUpload);
        pauseBtn.addEventListener('click', togglePause);
        cancelBtn.addEventListener('click', cancelUpload);

        function togglePause() {
            if (!isUploading) return;

            isPaused = !isPaused;

            if (isPaused) {
                pauseBtn.innerHTML = \`
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    Resume\`;
                overallLabel.textContent = 'Paused';
                // Mark currently uploading file as paused
                filesToUpload.filter(f => f.status === 'uploading').forEach(f => { f.status = 'paused'; });
                renderFileList();
            } else {
                pauseBtn.innerHTML = \`
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16"></rect>
                        <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>
                    Pause\`;
                overallLabel.textContent = 'Uploading...';
                // Resume paused files back to uploading
                filesToUpload.filter(f => f.status === 'paused').forEach(f => { f.status = 'uploading'; });
                renderFileList();
            }
        }

        function cancelUpload() {
            if (!isUploading) return;

            isCancelled = true;
            isPaused = false;

            // Abort active XHR
            if (activeXHR) {
                activeXHR.abort();
                activeXHR = null;
            }

            // Mark in-progress/paused files as cancelled
            filesToUpload.forEach(f => {
                if (f.status === 'uploading' || f.status === 'paused' || f.status === 'pending') {
                    f.status = 'cancelled';
                    f.progress = 0;
                }
            });

            isUploading = false;
            renderFileList();
            overallLabel.textContent = 'Upload cancelled';
            showIdleUI();
            // Reset cancelled files to pending so they can be retried
            setTimeout(() => {
                filesToUpload.forEach(f => {
                    if (f.status === 'cancelled') { f.status = 'pending'; f.progress = 0; }
                });
                renderFileList();
                showIdleUI();
            }, 2000);
        }

        // ---- Wait for unpause helper ----
        function waitForUnpause() {
            return new Promise((resolve) => {
                if (!isPaused) return resolve();
                const check = setInterval(() => {
                    if (!isPaused || isCancelled) {
                        clearInterval(check);
                        resolve();
                    }
                }, 200);
            });
        }

        // ---- Upload orchestration ----
        async function startUpload() {
            const pending = filesToUpload.filter(f => f.status === 'pending' || f.status === 'error');
            if (pending.length === 0) {
                // "Upload More Files" mode — reset for new files
                filesToUpload = [];
                successMessage.classList.remove('show');
                overallProgress.classList.remove('show');
                overallFill.classList.remove('complete');
                overallFill.style.width = '0%';
                overallPercent.textContent = '0%';
                renderFileList();
                showIdleUI();
                return;
            }

            isUploading = true;
            isPaused = false;
            isCancelled = false;
            errorBanner.classList.remove('show');
            successMessage.classList.remove('show');
            overallProgress.classList.add('show');
            overallFill.classList.remove('complete');
            overallFill.style.width = '0%';
            overallLabel.textContent = 'Uploading...';
            showUploadingUI();

            let completed = 0;
            let failed = 0;

            for (const item of pending) {
                if (isCancelled) break;

                // Wait if paused
                await waitForUnpause();
                if (isCancelled) break;

                item.status = 'uploading';
                item.progress = 0;
                item.error = null;
                renderFileList();

                try {
                    await uploadFile(item);
                    item.status = 'complete';
                    item.progress = 100;
                    completed++;
                } catch (err) {
                    if (isCancelled) break;
                    item.status = 'error';
                    item.error = err.message || 'Upload failed';
                    failed++;
                }
                renderFileList();
                updateOverallProgress(completed + failed, pending.length);
            }

            if (isCancelled) return; // cancelUpload() already handled UI

            isUploading = false;

            if (failed === 0) {
                overallFill.classList.add('complete');
                overallLabel.textContent = 'All uploads complete';
                successMessage.classList.add('show');
                showCompleteUI();
            } else {
                overallLabel.textContent = failed + ' file(s) failed';
                showIdleUI();
                startBtn.innerHTML = 'Retry Failed';
                startBtn.disabled = false;
            }
        }

        // ---- XHR send with retry ----
        function sendWithRetry(formData, headers, onProgress, attempt) {
            attempt = attempt || 0;
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                activeXHR = xhr;

                if (onProgress) {
                    xhr.upload.addEventListener('progress', onProgress);
                }

                xhr.addEventListener('load', () => {
                    activeXHR = null;
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            if (data.success) { resolve(data); }
                            else { reject(new Error(data.error || 'Upload failed')); }
                        } catch { reject(new Error('Invalid server response')); }
                    } else if (xhr.status === 401) {
                        reject(new Error('Session expired — please reload the page and re-enter the password'));
                    } else {
                        // Retry on server errors (5xx) and timeouts (524)
                        const retryable = xhr.status >= 500 || xhr.status === 0;
                        if (retryable && attempt < MAX_RETRIES) {
                            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                            console.log('Retry attempt ' + (attempt + 1) + ' in ' + delay + 'ms (HTTP ' + xhr.status + ')');
                            setTimeout(() => {
                                sendWithRetry(formData, headers, onProgress, attempt + 1).then(resolve).catch(reject);
                            }, delay);
                        } else {
                            try {
                                const data = JSON.parse(xhr.responseText);
                                reject(new Error(data.error || 'Upload failed (HTTP ' + xhr.status + ')'));
                            } catch { reject(new Error('Upload failed (HTTP ' + xhr.status + ')')); }
                        }
                    }
                });

                xhr.addEventListener('error', () => {
                    activeXHR = null;
                    if (isCancelled) { reject(new Error('Upload cancelled')); return; }
                    if (attempt < MAX_RETRIES) {
                        const delay = Math.pow(2, attempt) * 1000;
                        console.log('Network error, retry ' + (attempt + 1) + ' in ' + delay + 'ms');
                        setTimeout(() => {
                            sendWithRetry(formData, headers, onProgress, attempt + 1).then(resolve).catch(reject);
                        }, delay);
                    } else {
                        reject(new Error('Network error after ' + MAX_RETRIES + ' retries'));
                    }
                });

                xhr.addEventListener('abort', () => { activeXHR = null; reject(new Error('Upload cancelled')); });

                xhr.open('POST', '/share/' + TOKEN + '/upload');
                if (headers) {
                    Object.keys(headers).forEach(k => xhr.setRequestHeader(k, headers[k]));
                }
                xhr.withCredentials = true;
                xhr.send(formData);
            });
        }

        // ---- File upload (single or chunked) ----
        function uploadFile(item) {
            const file = item.file;
            const totalSize = file.size;

            // Small files: single request (with retry)
            if (totalSize <= CHUNK_SIZE) {
                const formData = new FormData();
                formData.append('file', file);

                return sendWithRetry(formData, null, (e) => {
                    if (e.lengthComputable) {
                        item.progress = Math.round((e.loaded / e.total) * 100);
                        renderFileList();
                        updateFileProgress();
                    }
                });
            }

            // Large files: chunked upload (with per-chunk retry)
            return new Promise(async (resolve, reject) => {
                const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
                const uploadId = Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
                let uploadedBytes = 0;

                try {
                    for (let i = 0; i < totalChunks; i++) {
                        if (isCancelled) { reject(new Error('Upload cancelled')); return; }

                        await waitForUnpause();
                        if (isCancelled) { reject(new Error('Upload cancelled')); return; }

                        item.status = 'uploading';
                        renderFileList();

                        const start = i * CHUNK_SIZE;
                        const end = Math.min(start + CHUNK_SIZE, totalSize);
                        const chunk = file.slice(start, end);

                        const formData = new FormData();
                        formData.append('chunk', chunk);

                        await sendWithRetry(formData, {
                            'X-Chunk-Index': i,
                            'X-Total-Chunks': totalChunks,
                            'X-Upload-Id': uploadId,
                            'X-Filename': encodeURIComponent(file.name),
                            'X-Filesize': totalSize
                        }, (e) => {
                            if (e.lengthComputable) {
                                const chunkUploaded = uploadedBytes + e.loaded;
                                item.progress = Math.round((chunkUploaded / totalSize) * 100);
                                renderFileList();
                                updateFileProgress();
                            }
                        });

                        uploadedBytes = end;
                        item.progress = Math.round((uploadedBytes / totalSize) * 100);
                        renderFileList();
                        updateFileProgress();
                    }

                    resolve({ success: true, file: { originalName: file.name, size: totalSize } });
                } catch (err) {
                    reject(err);
                }
            });
        }

        function updateFileProgress() {
            const active = filesToUpload.filter(f => f.status !== 'pending' && f.status !== 'cancelled');
            if (active.length === 0) return;
            const totalProgress = active.reduce((sum, f) => sum + (f.progress || 0), 0);
            const overallPct = Math.round(totalProgress / active.length);
            overallPercent.textContent = overallPct + '%';
            overallFill.style.width = overallPct + '%';
        }

        function updateOverallProgress(done, total) {
            const pct = Math.round((done / total) * 100);
            overallPercent.textContent = pct + '%';
            overallFill.style.width = pct + '%';
            overallLabel.textContent = 'Uploaded ' + done + ' of ' + total + ' files';
        }
    </script>
</body>
</html>
  `;
}

module.exports = router;
