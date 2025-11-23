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

    // Format file data for frontend
    const formattedFiles = files.map(file => ({
      id: file.id,
      original_name: file.original_name,
      filename: file.filename,
      file_size: file.file_size,
      type: getFileType(file.mime_type),
      mime_type: file.mime_type,
      duration: file.duration,
      folder: file.folder || 'TO AA',
      uploaded_at: file.uploaded_at
    }));

    res.json(formattedFiles);
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

// Stream file - unauthenticated version for Electron app (with project ID)
router.get('/:projectId/:id/stream', (req, res) => {
  try {
    const result = getAuthorizedFile(req.params.id, parseInt(req.params.projectId));
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { file } = result;

    // Prefer transcoded file for streaming, fall back to original
    let streamPath = file.file_path;
    let mimeType = file.mime_type;

    if (file.transcoded_file_path && fs.existsSync(file.transcoded_file_path)) {
      streamPath = file.transcoded_file_path;
      mimeType = 'video/mp4'; // Transcoded files are always MP4
      console.log(`Streaming transcoded version of file ${file.id}`);
    } else if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const stat = fs.statSync(streamPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video/audio seeking
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(streamPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
      });

      fileStream.pipe(res);
    } else {
      // No range, send entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
      });

      fs.createReadStream(streamPath).pipe(res);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stream file (for video/audio playback) - authenticated version for web client
router.get('/:id/stream', requireAuth, (req, res) => {
  try {
    const result = getAuthorizedFile(req.params.id, req.session.projectId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { file } = result;

    // Prefer transcoded file for streaming, fall back to original
    let streamPath = file.file_path;
    let mimeType = file.mime_type;

    if (file.transcoded_file_path && fs.existsSync(file.transcoded_file_path)) {
      streamPath = file.transcoded_file_path;
      mimeType = 'video/mp4'; // Transcoded files are always MP4
      console.log(`Streaming transcoded version of file ${file.id}`);
    } else if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const stat = fs.statSync(streamPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video/audio seeking
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(streamPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
      });

      fileStream.pipe(res);
    } else {
      // No range, send entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
      });

      fs.createReadStream(streamPath).pipe(res);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// Get comments for a file - unauthenticated version for Electron app
router.get('/:projectId/:id/comments', (req, res) => {
  try {
    const result = getAuthorizedFile(req.params.id, parseInt(req.params.projectId));
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const comments = commentQueries.findByFile.all(req.params.id);

    // Format comments for frontend
    const formattedComments = comments.map(comment => ({
      id: comment.id,
      author: comment.author_name,
      timecode: comment.timecode,
      timeSeconds: parseTimecode(comment.timecode),
      text: comment.comment_text,
      status: 'open', // We can add status field to DB later
      createdAt: comment.created_at
    }));

    res.json(formattedComments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get comments for a file - authenticated version for web client
router.get('/:id/comments', requireAuth, (req, res) => {
  try {
    const result = getAuthorizedFile(req.params.id, req.session.projectId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const comments = commentQueries.findByFile.all(req.params.id);

    // Format comments for frontend
    const formattedComments = comments.map(comment => ({
      id: comment.id,
      author: comment.author_name,
      timecode: comment.timecode,
      timeSeconds: parseTimecode(comment.timecode),
      text: comment.comment_text,
      status: 'open', // We can add status field to DB later
      createdAt: comment.created_at
    }));

    res.json(formattedComments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add comment to a file - unauthenticated version for Electron app
router.post('/:projectId/:id/comments', (req, res) => {
  try {
    const result = getAuthorizedFile(req.params.id, parseInt(req.params.projectId));
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { author_name, timecode, comment_text } = req.body;

    if (!author_name || !comment_text) {
      return res.status(400).json({ error: 'Author name and comment text are required' });
    }

    // Insert comment
    const insertResult = commentQueries.create.run(
      req.params.id,
      author_name,
      timecode || null,
      comment_text
    );

    res.json({
      id: insertResult.lastInsertRowid,
      author: author_name,
      timecode,
      text: comment_text,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add comment to a file - authenticated version for web client
router.post('/:id/comments', requireAuth, (req, res) => {
  try {
    const result = getAuthorizedFile(req.params.id, req.session.projectId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { author_name, timecode, comment_text } = req.body;

    if (!author_name || !comment_text) {
      return res.status(400).json({ error: 'Author name and comment text are required' });
    }

    // Insert comment
    const insertResult = commentQueries.create.run(
      req.params.id,
      author_name,
      timecode || null,
      comment_text
    );

    res.json({
      id: insertResult.lastInsertRowid,
      author: author_name,
      timecode,
      text: comment_text,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to determine file type from MIME type
function getFileType(mimeType) {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/')) return 'image';
  return 'document';
}

// Parse timecode HH:MM:SS to seconds
function parseTimecode(timecode) {
  if (!timecode) return 0;
  const parts = timecode.split(':').map(p => parseInt(p) || 0);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

module.exports = router;
