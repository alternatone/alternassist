const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../models/database');
const { requireAdmin } = require('../middleware/auth');

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
    const { project_id, file_id, ftp_path, expires_in, password } = req.body;

    if (!project_id && !file_id && !ftp_path) {
      return res.status(400).json({ error: 'project_id, file_id, or ftp_path is required' });
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
      INSERT INTO share_links (token, project_id, file_id, ftp_path, expires_at, password_hash, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      token,
      project_id || null,
      file_id || null,
      ftp_path || null,
      expiresAt,
      passwordHash,
      null  // No admin session available yet
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
  // Update access count
  shareQueries.updateAccessCount.run(link.token);

  // Redirect based on link type
  if (link.project_id) {
    // Project share link
    res.redirect(`/client/login.html?share=${link.token}&project=${link.project_id}`);
  } else if (link.file_id) {
    // Database file share link
    res.redirect(`/client/login.html?share=${link.token}&file=${link.file_id}`);
  } else if (link.ftp_path) {
    // FTP browser file share link - go directly to media review page
    res.redirect(`/media/media_review.html?ftpFile=${encodeURIComponent(link.ftp_path)}`);
  } else {
    res.status(500).send('Invalid share link configuration');
  }
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

module.exports = router;
