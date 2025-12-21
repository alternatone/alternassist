const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { downloadTokenQueries } = require('../models/database');

// Base path for all files
const FTP_BASE_PATH = '/Volumes/FTP1';

// Generate a secure random token
function generateToken() {
  return crypto.randomBytes(16).toString('hex'); // 32 characters
}

// POST /api/downloads/generate
// Create a public download link for a file
router.post('/generate', (req, res) => {
  try {
    const { file_path } = req.body;

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

    // Generate token and expiry (7 days from now)
    const token = generateToken();
    const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days in seconds

    // Store in database
    downloadTokenQueries.create.run(token, file_path, expiresAt);

    // Return the public URL
    const url = `https://alternassist.alternatone.com/dl/${token}`;

    res.json({
      url,
      expires_at: expiresAt,
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

    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    if (tokenRecord.expires_at < now) {
      // Delete expired token
      downloadTokenQueries.delete.run(token);
      return res.status(404).send('Not found');
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
