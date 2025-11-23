const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { fileQueries, projectQueries } = require('../models/database');
const config = require('../../alternaview-config');
const transcoder = require('../services/transcoder');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Get project from session
    const projectId = req.session?.projectId;
    if (!projectId) {
      return cb(new Error('Not authenticated'));
    }

    const project = projectQueries.findById.get(projectId);
    if (!project) {
      return cb(new Error('Project not found'));
    }

    // Create project directory if it doesn't exist
    const projectPath = path.join(config.storagePath, project.name);
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    cb(null, projectPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.maxFileSize || 100 * 1024 * 1024 * 1024 // 100GB default
  }
});

// Upload endpoint
router.post('/', upload.single('file'), async (req, res) => {
  try {
    // Check authentication
    const projectId = req.session?.projectId;
    if (!projectId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const project = projectQueries.findById.get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get file info
    const originalName = req.file.originalname;
    const filename = req.file.filename;
    const filePath = req.file.path;
    const mimeType = req.file.mimetype;

    // Get file size from filesystem
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    console.log('Debug - Upload file info:', {
      originalName,
      filename,
      filePath,
      mimeType,
      fileSize,
      statsSize: stats.size,
      reqFileSize: req.file.size
    });

    // Insert into database
    const result = fileQueries.create.run(
      projectId,
      filename,
      originalName,
      filePath,
      fileSize,
      mimeType,
      null,  // duration
      null   // transcoded_file_path
    );

    const fileId = result.lastInsertRowid;

    // Trigger transcoding for video files
    if (mimeType.startsWith('video/')) {
      const projectPath = path.join(config.storagePath, project.name);
      transcoder.processVideoFile(filePath, projectPath, originalName)
        .then(transcodedPath => {
          if (transcodedPath) {
            fileQueries.updateTranscodedPath.run(transcodedPath, fileId);
            console.log(`Transcode complete for file ${fileId}: ${transcodedPath}`);
          } else {
            console.log(`File ${fileId} is already optimized - no transcode needed`);
          }
        })
        .catch(err => {
          console.error(`Transcoding failed for file ${fileId}:`, err);
        });
    }

    console.log(`File uploaded: ${originalName} -> ${filename} (${fileSize} bytes)`);

    res.json({
      success: true,
      file: {
        id: fileId,
        filename: filename,
        original_name: originalName,
        file_size: fileSize,
        mime_type: mimeType
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
