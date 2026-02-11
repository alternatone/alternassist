const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { db } = require('../models/database');

const router = express.Router();

// Import middleware (will be required when available)
let requireAdmin;
try {
  const auth = require('../middleware/auth');
  requireAdmin = auth.requireAdmin;
} catch (e) {
  // Fallback middleware if not available yet
  requireAdmin = (req, res, next) => {
    if (!req.session.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  };
}

/**
 * Admin Login
 * POST /api/admin/login
 */
router.post('/login',
  body('username').trim().notEmpty().isLength({ max: 50 }),
  body('password').notEmpty().isLength({ min: 1, max: 128 }),
  async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    try {
      // Find admin user
      const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);

      if (!admin) {
        // Don't reveal whether user exists
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Verify password
      const valid = await bcrypt.compare(password, admin.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          return res.status(500).json({ error: 'Session error' });
        }

        // Set admin session flags
        req.session.isAdmin = true;
        req.session.adminId = admin.id;
        req.session.username = admin.username;

        // Explicitly save so Set-Cookie header is sent with the response
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
            return res.status(500).json({ error: 'Session error' });
          }

          console.log(`[ADMIN LOGIN] ${admin.username} logged in from ${req.ip}`);

          res.json({
            success: true,
            username: admin.username
          });
        });
      });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

/**
 * Admin Logout
 * POST /api/admin/logout
 */
router.post('/logout', (req, res) => {
  const username = req.session.username;

  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }

    console.log(`[ADMIN LOGOUT] ${username} logged out`);
    res.json({ success: true });
  });
});

/**
 * Check Admin Status
 * GET /api/admin/status
 */
router.get('/status', (req, res) => {
  res.json({
    isAdmin: !!req.session.isAdmin,
    username: req.session.username || null
  });
});

/**
 * Reset Project Password (Admin only)
 * POST /api/admin/projects/:id/reset-password
 */
router.post('/projects/:id/reset-password', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Check if project exists
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate random password (16 characters)
    const newPassword = crypto.randomBytes(8).toString('hex');

    // Hash the password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update database
    db.prepare('UPDATE projects SET password = ? WHERE id = ?')
      .run(passwordHash, id);

    // Log the action
    try {
      db.prepare('INSERT INTO activity_log (project_id, action, details) VALUES (?, ?, ?)')
        .run(id, 'password_reset', `Admin ${req.session.username} reset password`);
    } catch (logError) {
      // Don't fail if activity log fails
      console.error('Activity log error:', logError);
    }

    console.log(`[ADMIN] ${req.session.username} reset password for project ${project.name} (ID: ${id})`);

    // Return password ONE TIME only
    res.json({
      success: true,
      password: newPassword,
      message: 'Password reset successfully. Share this with the client immediately - it will not be shown again.'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

module.exports = router;
