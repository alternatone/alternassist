const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { fileQueries, projectQueries, commentQueries } = require('../models/database');
const config = require('../../alternaview-config');
const transcoder = require('../services/transcoder');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.session.projectId) {
      return cb(new Error('Not authenticated'));
    }

    const project = projectQueries.findById.get(req.session.projectId);
    if (!project) {
      return cb(new Error('Project not found'));
    }

    const projectPath = path.join(config.storagePath, project.name);

    // Create project folder structure if it doesn't exist
    const toAAPath = path.join(projectPath, 'TO AA');
    const fromAAPath = path.join(projectPath, 'FROM AA');

    if (!fs.existsSync(toAAPath)) {
      fs.mkdirSync(toAAPath, { recursive: true });
    }
    if (!fs.existsSync(fromAAPath)) {
      fs.mkdirSync(fromAAPath, { recursive: true });
    }

    // Client uploads go to "TO AA" folder
    cb(null, toAAPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.maxFileSize
  },
  fileFilter: (req, file, cb) => {
    // Accept all files for now, can add filtering later
    cb(null, true);
  }
});

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (!req.session.projectId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Helper function to get and authorize file access
function getAuthorizedFile(fileId, projectId) {
  const file = fileQueries.findById.get(fileId);

  if (!file) {
    return { error: 'File not found', status: 404 };
  }

  if (file.project_id !== projectId) {
    return { error: 'Access denied', status: 403 };
  }

  return { file };
}

// Get all files for current project
router.get('/', requireAuth, (req, res) => {
  try {
    const files = fileQueries.findByProject.all(req.session.projectId);
    const typeMap = { video: 'video/', audio: 'audio/', image: 'image/' };

    res.json(files.map(f => ({
      ...f,
      type: Object.keys(typeMap).find(k => f.mime_type.startsWith(typeMap[k])) || 'document'
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload file
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const project = projectQueries.findById.get(req.session.projectId);
    const projectPath = path.join(config.storagePath, project.name);

    // Insert file record into database first (without transcoded path)
    const result = fileQueries.create.run(
      req.session.projectId,
      req.file.filename,
      req.file.originalname,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      null, // duration - will be extracted during transcoding
      null, // transcoded_file_path - will be set after transcoding
      'TO AA' // folder - client uploads go to TO AA
    );

    const fileId = result.lastInsertRowid;

    // Update project timestamp
    projectQueries.updateTimestamp.run(req.session.projectId);

    // Send immediate response
    res.json({
      success: true,
      file: {
        id: fileId,
        name: req.file.originalname,
        size: req.file.size,
        type: getFileType(req.file.mimetype)
      }
    });

    // Transcode video in the background (for video files only)
    if (req.file.mimetype.startsWith('video/')) {
      console.log(`Starting background transcode for file ${fileId}: ${req.file.originalname}`);

      // Don't await - let it run in background
      transcoder.processVideoFile(req.file.path, projectPath, req.file.originalname)
        .then((transcodedPath) => {
          if (transcodedPath) {
            // Update database with transcoded file path
            fileQueries.updateTranscodedPath.run(transcodedPath, fileId);
            console.log(`Transcode complete for file ${fileId}`);
          } else {
            console.log(`File ${fileId} is already optimized - no transcode needed`);
          }
        })
        .catch((error) => {
          console.error(`Transcode failed for file ${fileId}:`, error.message);
          // Don't fail the upload - just log the error
          // File will still be available for download in original format
        });
    }
  } catch (error) {
    // Clean up file if database insert fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Download file
router.get('/:id/download', requireAuth, (req, res) => {
  try {
    const result = getAuthorizedFile(req.params.id, req.session.projectId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { file } = result;

    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(file.file_path, file.original_name);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unified streaming handler (eliminates 108 → 32 line duplication)
function streamFile(fileId, projectId, req, res) {
  try {
    const result = getAuthorizedFile(fileId, projectId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { file } = result;

    // Prefer transcoded file for streaming, fall back to original
    const streamPath = (file.transcoded_file_path && fs.existsSync(file.transcoded_file_path))
      ? file.transcoded_file_path
      : file.file_path;

    if (!fs.existsSync(streamPath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const { size } = fs.statSync(streamPath);
    const range = req.headers.range;
    const [start, end = size - 1] = range
      ? range.replace(/bytes=/, "").split("-").map(Number)
      : [0, size - 1];

    res.writeHead(range ? 206 : 200, {
      'Content-Range': range ? `bytes ${start}-${end}/${size}` : undefined,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': file.transcoded_file_path ? 'video/mp4' : file.mime_type
    });

    fs.createReadStream(streamPath, { start, end }).pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Stream file - unauthenticated version for Electron app (with project ID)
router.get('/:projectId/:id/stream', (req, res) =>
  streamFile(req.params.id, parseInt(req.params.projectId), req, res)
);

// Stream file (for video/audio playback) - authenticated version for web client
router.get('/:id/stream', requireAuth, (req, res) =>
  streamFile(req.params.id, req.session.projectId, req, res)
);

// Delete file
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const result = getAuthorizedFile(req.params.id, req.session.projectId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { file } = result;

    // Delete original file from disk
    if (fs.existsSync(file.file_path)) {
      fs.unlinkSync(file.file_path);
    }

    // Delete transcoded file if it exists
    if (file.transcoded_file_path && fs.existsSync(file.transcoded_file_path)) {
      fs.unlinkSync(file.transcoded_file_path);
    }

    // Delete from database
    fileQueries.delete.run(file.id);

    // Update project timestamp
    projectQueries.updateTimestamp.run(req.session.projectId);

    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unified comment handlers (eliminates 116 → 38 line duplication)
function getComments(fileId, projectId, res) {
  try {
    const result = getAuthorizedFile(fileId, projectId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const comments = commentQueries.findByFile.all(fileId);
    res.json(comments.map(c => ({
      id: c.id,
      author: c.author_name,
      timecode: c.timecode,
      text: c.comment_text,
      createdAt: c.created_at
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function addComment(fileId, projectId, body, res) {
  try {
    const { author_name, timecode, comment_text } = body;
    if (!author_name || !comment_text) {
      return res.status(400).json({ error: 'Author name and comment required' });
    }

    const result = getAuthorizedFile(fileId, projectId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const insertResult = commentQueries.create.run(fileId, author_name, timecode || null, comment_text);
    res.json({ id: insertResult.lastInsertRowid, author: author_name, timecode, text: comment_text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get comments - unauthenticated version for Electron app
router.get('/:projectId/:id/comments', (req, res) =>
  getComments(req.params.id, parseInt(req.params.projectId), res)
);

// Get comments - authenticated version for web client
router.get('/:id/comments', requireAuth, (req, res) =>
  getComments(req.params.id, req.session.projectId, res)
);

// Add comment - unauthenticated version for Electron app
router.post('/:projectId/:id/comments', (req, res) =>
  addComment(req.params.id, parseInt(req.params.projectId), req.body, res)
);

// Add comment - authenticated version for web client
router.post('/:id/comments', requireAuth, (req, res) =>
  addComment(req.params.id, req.session.projectId, req.body, res)
);

module.exports = router;
