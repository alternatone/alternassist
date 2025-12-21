const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { downloadTokenQueries } = require('../models/database');
const { requireAdmin } = require('../middleware/auth');

// Base path for all files
const FTP_BASE_PATH = '/Volumes/FTP1';

// Generate a secure random token
function generateToken() {
  return crypto.randomBytes(16).toString('hex'); // 32 characters
}

// Parse expiry string to seconds
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

// POST /api/downloads/generate
// Create a public download link for a file (ADMIN ONLY)
router.post('/generate', requireAdmin, (req, res) => {
  try {
    const { file_path, expires_in } = req.body;

    if (!file_path) {
      return res.status(400).json({ error: 'file_path is required' });
    }

    // Verify file exists
    const fullPath = path.join(FTP_BASE_PATH, file_path);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Verify it's a file, not a directory
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    // Generate token
    const token = generateToken();

    // Calculate expiry based on user selection
    let expiresAt;
    if (expires_in === 'never' || expires_in === null || expires_in === undefined) {
      expiresAt = null;  // No expiry
    } else if (typeof expires_in === 'number') {
      expiresAt = Math.floor(Date.now() / 1000) + expires_in;
    } else {
      // expires_in could be '7d', '3d', '1d'
      const seconds = parseExpiry(expires_in);
      expiresAt = Math.floor(Date.now() / 1000) + seconds;
    }

    // Store in database
    downloadTokenQueries.create.run(token, file_path, expiresAt);

    console.log(`[ADMIN] ${req.session.username} generated download link for ${file_path} (expires: ${expiresAt || 'never'})`);

    // Return the public URL
    const url = `https://alternassist.alternatone.com/dl/${token}`;

    res.json({
      url,
      expires_at: expiresAt,
      expires_in: expires_in,
      token
    });
  } catch (error) {
    console.error('Error generating download link:', error);
    res.status(500).json({ error: 'Failed to generate download link' });
  }
});

// GET /dl/:token
// Public download endpoint - no auth required
router.get('/:token', (req, res) => {
  try {
    const { token } = req.params;

    // Clean up expired tokens periodically
    downloadTokenQueries.deleteExpired.run();

    // Find token in database
    const tokenRecord = downloadTokenQueries.findByToken.get(token);

    if (!tokenRecord) {
      return res.status(404).send('Not found');
    }

    // Check if expired (NULL means no expiry)
    const now = Math.floor(Date.now() / 1000);
    if (tokenRecord.expires_at !== null && tokenRecord.expires_at < now) {
      // Delete expired token
      downloadTokenQueries.delete.run(token);
      return res.status(410).send('Download link expired');
    }

    // Build full file path
    const fullPath = path.join(FTP_BASE_PATH, tokenRecord.file_path);

    // Verify file still exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).send('Not found');
    }

    // Increment download count
    downloadTokenQueries.incrementDownloadCount.run(token);

    // Get file stats for proper headers
    const stats = fs.statSync(fullPath);
    const fileName = path.basename(tokenRecord.file_path);

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);

    // Stream the file
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);

    // Handle stream errors
    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).send('Error streaming file');
      }
    });

  } catch (error) {
    console.error('Error processing download:', error);
    if (!res.headersSent) {
      res.status(404).send('Not found');
    }
  }
});

module.exports = router;
