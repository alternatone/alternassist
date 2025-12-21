const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../../alternaview-config');
const { projectQueries } = require('../models/database');
const { requireAdmin } = require('../middleware/auth');

// Helper to ensure FTP drive is available
function ensureFTPAvailable() {
  if (!fs.existsSync(config.storagePath)) {
    throw new Error('FTP drive not mounted. Please connect external drive.');
  }
}

// Secure path sanitization to prevent directory traversal
function sanitizePath(userPath) {
  // Normalize and resolve against FTP base
  const normalized = path.normalize(userPath || '');
  const resolved = path.resolve(config.storagePath, normalized);

  // Ensure result is still within FTP_BASE_PATH
  if (!resolved.startsWith(config.storagePath)) {
    throw new Error('Invalid path - access denied');
  }

  return resolved;
}

// Helper to get file/folder stats
function getFileStats(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      modified: stats.mtime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile()
    };
  } catch (error) {
    return null;
  }
}

// Helper to check if file is media
function isMediaFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mediaExtensions = [
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v',
    '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'
  ];
  return mediaExtensions.includes(ext);
}

// Helper to get MIME type
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.m4v': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Browse FTP filesystem (ADMIN ONLY)
router.get('/browse', requireAdmin, (req, res) => {
  try {
    ensureFTPAvailable();

    const requestedPath = req.query.path || '';

    // Security: Prevent directory traversal with proper sanitization
    const safePath = sanitizePath(requestedPath);

    // Check if path exists
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const stats = fs.statSync(safePath);

    // If it's a file, return file info
    if (stats.isFile()) {
      return res.json({
        type: 'file',
        name: path.basename(safePath),
        path: path.relative(config.storagePath, safePath),
        size: stats.size,
        modified: stats.mtime,
        mimeType: getMimeType(safePath)
      });
    }

    // If it's a directory, list contents
    const dirItems = fs.readdirSync(safePath);

    const contents = dirItems
      .filter(item => !item.startsWith('.')) // Skip hidden files
      .map(item => {
        const itemPath = path.join(safePath, item);
        const itemStats = getFileStats(itemPath);

        if (!itemStats) return null;

        const relativePath = path.relative(config.storagePath, itemPath);

        return {
          name: item,
          path: relativePath,
          type: itemStats.isDirectory ? 'folder' : 'file',
          size: itemStats.size,
          modified: itemStats.modified,
          mimeType: itemStats.isFile ? getMimeType(item) : null,
          isMedia: itemStats.isFile ? isMediaFile(item) : false
        };
      })
      .filter(item => item !== null)
      .sort((a, b) => {
        // Folders first, then files
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        // Alphabetical within each type
        return a.name.localeCompare(b.name);
      });

    // Check if any of these folders are associated with projects
    const folderNames = contents.filter(c => c.type === 'folder').map(c => c.name);
    const projects = projectQueries.getAll.all();
    const projectMap = {};

    projects.forEach(project => {
      if (project.folder_path && folderNames.includes(project.folder_path)) {
        projectMap[project.folder_path] = project;
      }
    });

    // Transform contents to match client expectations
    const items = contents.map(item => {
      const result = {
        name: item.name,
        isDirectory: item.type === 'folder',
        size: item.size,
        modified: item.modified,
        isMedia: item.isMedia
      };

      // Add folder-specific data
      if (item.type === 'folder') {
        const folderPath = path.join(safePath, item.name);
        try {
          const folderItems = fs.readdirSync(folderPath);
          const folderStats = folderItems.map(fi => {
            const fiPath = path.join(folderPath, fi);
            try {
              return fs.statSync(fiPath);
            } catch {
              return null;
            }
          }).filter(s => s !== null);

          result.itemCount = folderStats.length;
          result.totalSize = folderStats.reduce((sum, s) => sum + s.size, 0);

          // Check if this folder is associated with a project
          if (projectMap[item.name]) {
            result.projectName = projectMap[item.name].name;
          }
        } catch (error) {
          result.itemCount = 0;
          result.totalSize = 0;
        }
      }

      return result;
    });

    res.json({
      type: 'directory',
      path: path.relative(config.storagePath, safePath),
      items,
      projectMap
    });

  } catch (error) {
    if (error.message.includes('FTP drive not mounted')) {
      return res.status(503).json({
        error: 'FTP drive not available',
        suggestion: 'Please connect the external drive.'
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Stream file from FTP (ADMIN ONLY)
router.get('/stream', requireAdmin, (req, res) => {
  try {
    ensureFTPAvailable();

    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path parameter required' });
    }

    // Security: Prevent directory traversal with proper sanitization
    const safePath = sanitizePath(requestedPath);

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stats = fs.statSync(safePath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    const { size } = stats;
    const range = req.headers.range;

    let start = 0;
    let end = size - 1;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      start = parseInt(parts[0], 10);
      end = parts[1] ? parseInt(parts[1], 10) : size - 1;
    }

    const headers = {
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': getMimeType(safePath)
    };

    if (range) {
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }

    res.writeHead(range ? 206 : 200, headers);

    const stream = fs.createReadStream(safePath, { start, end });
    stream.on('error', (streamError) => {
      console.error('Stream read error:', streamError);
    });
    stream.pipe(res);

  } catch (error) {
    if (error.message.includes('FTP drive not mounted')) {
      return res.status(503).json({
        error: 'FTP drive not available',
        suggestion: 'Please connect the external drive.'
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Download file from FTP (ADMIN ONLY)
router.get('/download', requireAdmin, (req, res) => {
  try {
    ensureFTPAvailable();

    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path parameter required' });
    }

    // Security: Prevent directory traversal with proper sanitization
    const safePath = sanitizePath(requestedPath);

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stats = fs.statSync(safePath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    const filename = path.basename(safePath);
    res.download(safePath, filename);

  } catch (error) {
    if (error.message.includes('FTP drive not mounted')) {
      return res.status(503).json({
        error: 'FTP drive not available',
        suggestion: 'Please connect the external drive.'
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete file or folder from FTP (ADMIN ONLY)
router.delete('/delete', requireAdmin, (req, res) => {
  try {
    ensureFTPAvailable();

    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path parameter required' });
    }

    // Security: Prevent directory traversal with proper sanitization
    const safePath = sanitizePath(requestedPath);

    // Don't allow deleting the root FTP drive
    if (safePath === config.storagePath) {
      return res.status(403).json({ error: 'Cannot delete root directory' });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const stats = fs.statSync(safePath);

    if (stats.isDirectory()) {
      fs.rmSync(safePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(safePath);
    }

    res.json({ success: true, message: 'Deleted successfully' });

  } catch (error) {
    if (error.message.includes('FTP drive not mounted')) {
      return res.status(503).json({
        error: 'FTP drive not available',
        suggestion: 'Please connect the external drive.'
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Upload file to FTP folder (ADMIN ONLY)
router.post('/upload', requireAdmin, (req, res) => {
  try {
    ensureFTPAvailable();

    const multer = require('multer');

    // Configure multer for FTP uploads
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const targetPath = req.body.path || '';

        try {
          // Security: Prevent directory traversal with proper sanitization
          const safePath = sanitizePath(targetPath);

          // Create directory if it doesn't exist
          if (!fs.existsSync(safePath)) {
            fs.mkdirSync(safePath, { recursive: true });
          }

          cb(null, safePath);
        } catch (error) {
          cb(error);
        }
      },
      filename: (req, file, cb) => {
        cb(null, file.originalname);
      }
    });

    const upload = multer({ storage }).single('file');

    upload(req, res, (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ error: err.message });
      }

      res.json({
        success: true,
        message: 'File uploaded successfully',
        file: {
          name: req.file.originalname,
          size: req.file.size,
          path: path.relative(config.storagePath, req.file.path)
        }
      });
    });

  } catch (error) {
    if (error.message.includes('FTP drive not mounted')) {
      return res.status(503).json({
        error: 'FTP drive not available',
        suggestion: 'Please connect the external drive.'
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Backup FTP to FTP BACKUP (ADMIN ONLY)
router.post('/backup', requireAdmin, (req, res) => {
  try {
    ensureFTPAvailable();

    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, '../scripts/backup-ftp.js');

    const backupProcess = spawn('node', [scriptPath], {
      stdio: 'pipe'
    });

    let output = '';

    backupProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    backupProcess.stderr.on('data', (data) => {
      output += data.toString();
    });

    backupProcess.on('close', (code) => {
      if (code === 0) {
        res.json({ success: true, message: 'Backup completed successfully', output });
      } else {
        res.status(500).json({ error: 'Backup failed', output });
      }
    });

  } catch (error) {
    if (error.message.includes('FTP drive not mounted')) {
      return res.status(503).json({
        error: 'FTP drive not available',
        suggestion: 'Please connect the external drive.'
      });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
