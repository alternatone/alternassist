const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { fileQueries, projectQueries, commentQueries } = require('../models/database');
const { authenticateProjectAccess } = require('../middleware/auth');
const config = require('../../alternaview-config');
const transcoder = require('../services/transcoder');
const cache = require('../utils/cache');
const ActivityTracker = require('../services/activity-tracker');

// Helper function to ensure FTP drive is available
function ensureFTPAvailable() {
  if (!fs.existsSync(config.storagePath)) {
    throw new Error('FTP drive not mounted. Please connect external drive.');
  }
}

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

    // Ensure FTP drive is available
    try {
      ensureFTPAvailable();
    } catch (error) {
      return cb(error);
    }

    // Use folder_path field for storage location
    const projectPath = path.join(config.storagePath, project.folder_path);

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

// Public endpoint: Get file metadata without auth (for share links)
router.get('/public/:id', (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = fileQueries.findById.get(fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Return file metadata
    res.json({
      id: file.id,
      filename: file.filename,
      original_name: file.original_name,
      file_size: file.file_size,
      mime_type: file.mime_type,
      duration: file.duration,
      folder: file.folder,
      uploaded_at: file.uploaded_at
    });
  } catch (error) {
    console.error('Error fetching public file:', error);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// Public endpoint: Download file without auth (for admin and share links)
router.get('/public/:id/download', (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = fileQueries.findById.get(fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Use original file path for downloads (not transcoded)
    const filePath = file.file_path;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set headers for download - force streaming without buffering
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-store');

    // Flush headers immediately so browser shows download dialog
    res.flushHeaders();

    // Stream the file
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error downloading public file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Public endpoint: Stream file without auth (for share links)
router.get('/public/:id/stream', (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = fileQueries.findById.get(fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = file.transcoded_file_path || file.file_path;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': file.mime_type,
      };
      res.writeHead(206, head);
      fileStream.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': file.mime_type,
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('Error streaming public file:', error);
    res.status(500).json({ error: 'Failed to stream file' });
  }
});

// Get single file by ID (with project access validation)
router.get('/:id', authenticateProjectAccess, (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = fileQueries.findById.get(fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Validate project access
    const hasAccess = req.isAdmin || req.projectId === file.project_id;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const typeMap = { video: 'video/', audio: 'audio/', image: 'image/' };
    const type = Object.keys(typeMap).find(k => file.mime_type.startsWith(typeMap[k])) || 'document';

    res.json({
      ...file,
      type
    });
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
    const projectPath = path.join(config.storagePath, project.folder_path);

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

    // Invalidate all relevant caches
    cache.invalidate('projects:all');
    cache.invalidate('projects:with-scope');
    cache.invalidate(`project:${req.session.projectId}:stats`);

    // Track file upload activity
    ActivityTracker.log('file_upload', {
      projectId: req.session.projectId,
      fileId: fileId,
      metadata: {
        filename: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    }, req);

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
    // Check FTP availability
    try {
      ensureFTPAvailable();
    } catch (error) {
      return res.status(503).json({
        error: 'FTP drive not available',
        suggestion: 'Please connect the external drive to access files.'
      });
    }

    const result = getAuthorizedFile(req.params.id, req.session.projectId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { file } = result;

    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Track download activity
    ActivityTracker.log('file_download', {
      projectId: file.project_id,
      fileId: file.id,
      metadata: {
        filename: file.original_name,
        size: file.file_size
      }
    }, req);

    res.download(file.file_path, file.original_name);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unified streaming handler (eliminates 108 → 32 line duplication)
function streamFile(fileId, projectId, req, res) {
  try {
    // Check FTP availability
    try {
      ensureFTPAvailable();
    } catch (error) {
      return res.status(503).json({
        error: 'FTP drive not available',
        suggestion: 'Please connect the external drive to access media files.'
      });
    }

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

    let start = 0;
    let end = size - 1;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      start = parseInt(parts[0], 10);
      end = parts[1] ? parseInt(parts[1], 10) : size - 1;
    }

    // Track stream activity (only on first request, not ranges)
    if (!range || start === 0) {
      ActivityTracker.log('file_stream', {
        projectId: file.project_id,
        fileId: file.id,
        metadata: {
          filename: file.original_name,
          mime_type: file.mime_type
        }
      }, req);
    }

    const headers = {
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': file.transcoded_file_path ? 'video/mp4' : file.mime_type
    };

    if (range) {
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }

    res.writeHead(range ? 206 : 200, headers);

    const stream = fs.createReadStream(streamPath, { start, end });
    stream.on('error', (streamError) => {
      console.error('Stream read error:', streamError);
    });
    stream.pipe(res);
  } catch (error) {
    console.error('Stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      console.error('Headers already sent, cannot send error response');
    }
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
router.delete('/:id', (req, res) => {
  try {
    const fileId = req.params.id;
    const file = fileQueries.findById.get(fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const projectId = file.project_id;

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
    projectQueries.updateTimestamp.run(projectId);

    // Invalidate all relevant caches
    cache.invalidate('projects:all');
    cache.invalidate('projects:with-scope');
    cache.invalidate(`project:${projectId}:stats`);

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
      status: c.status || 'open',
      createdAt: c.created_at,
      reply_to_id: c.reply_to_id || null
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function addComment(fileId, projectId, body, res, req) {
  try {
    const { author_name, timecode, comment_text, reply_to_id } = body;
    if (!author_name || !comment_text) {
      return res.status(400).json({ error: 'Author name and comment required' });
    }

    const result = getAuthorizedFile(fileId, projectId);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const insertResult = commentQueries.create.run(fileId, author_name, timecode || null, comment_text, reply_to_id || null);
    const commentId = insertResult.lastInsertRowid;

    // Fetch the newly created comment to get the auto-generated created_at timestamp
    const newComment = commentQueries.findById.get(commentId);

    // Track comment addition activity
    ActivityTracker.log('comment_added', {
      projectId: projectId,
      fileId: fileId,
      metadata: {
        author: author_name,
        commentId: commentId
      }
    }, req);

    res.json({
      id: newComment.id,
      author: newComment.author_name,
      timecode: newComment.timecode,
      text: newComment.comment_text,
      status: newComment.status || 'open',
      createdAt: newComment.created_at,
      reply_to_id: newComment.reply_to_id || null
    });
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
  addComment(req.params.id, parseInt(req.params.projectId), req.body, res, req)
);

// Add comment - authenticated version for web client
router.post('/:id/comments', requireAuth, (req, res) =>
  addComment(req.params.id, req.session.projectId, req.body, res, req)
);

// Update comment status (OPTIMIZED: persist comment status changes)
router.patch('/comments/:id', authenticateProjectAccess, (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const { status } = req.body;

    if (!['open', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be "open" or "resolved"' });
    }

    // Check if comment exists
    const comment = commentQueries.findById.get(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Validate ownership via file → project relationship
    const file = fileQueries.findById.get(comment.file_id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if user has access to this project
    if (!req.isAdmin && file.project_id !== req.projectId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update status
    commentQueries.updateStatus.run(status, commentId);

    res.json({ success: true, id: commentId, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update comment status - Electron/unauthenticated version (with project ID)
router.patch('/:projectId/comments/:id', (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const projectId = parseInt(req.params.projectId);
    const { status } = req.body;

    if (!['open', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be "open" or "resolved"' });
    }

    const comment = commentQueries.findById.get(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const file = fileQueries.findById.get(comment.file_id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.project_id !== projectId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    commentQueries.updateStatus.run(status, commentId);
    res.json({ success: true, id: commentId, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete comment - Electron/unauthenticated version (with project ID)
router.delete('/:projectId/comments/:id', (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const projectId = parseInt(req.params.projectId);

    // Check if comment exists
    const comment = commentQueries.findById.get(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Validate ownership via file → project relationship
    const file = fileQueries.findById.get(comment.file_id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if comment belongs to this project
    if (file.project_id !== projectId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete comment
    commentQueries.delete.run(commentId);

    res.json({ success: true, id: commentId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete comment - Web/authenticated version
router.delete('/comments/:id', authenticateProjectAccess, (req, res) => {
  try {
    const commentId = parseInt(req.params.id);

    // Check if comment exists
    const comment = commentQueries.findById.get(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Validate ownership via file → project relationship
    const file = fileQueries.findById.get(comment.file_id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if user has access to this project
    if (!req.isAdmin && file.project_id !== req.projectId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete comment
    commentQueries.delete.run(commentId);

    res.json({ success: true, id: commentId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PHASE 2: File activity endpoint
router.get('/:id/activity', authenticateProjectAccess, (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 50;

    // Validate file access
    const file = fileQueries.findById.get(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const hasAccess = req.isAdmin || req.projectId === file.project_id;
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const activities = ActivityTracker.getFileActivity(fileId, limit);
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PHASE 3: Billable comments endpoints

// Mark comment as billable
router.patch('/comments/:id/billable', authenticateProjectAccess, (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const { billable, estimated_hours } = req.body;

    const comment = commentQueries.findById.get(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Validate project access
    const file = fileQueries.findById.get(comment.file_id);
    if (!req.isAdmin && file.project_id !== req.projectId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    commentQueries.updateBillable.run(
      billable ? 1 : 0,
      estimated_hours || null,
      commentId
    );

    res.json({ success: true, id: commentId, billable, estimated_hours });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Link comment to invoice
router.patch('/comments/:id/link-invoice', authenticateProjectAccess, (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const { invoiceId } = req.body;

    const comment = commentQueries.findById.get(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Validate project access
    const file = fileQueries.findById.get(comment.file_id);
    if (!req.isAdmin && file.project_id !== req.projectId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    commentQueries.linkToInvoice.run(invoiceId || null, commentId);

    res.json({ success: true, id: commentId, invoiceId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Move file to different folder
router.put('/:projectId/files/:fileId/move', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const fileId = parseInt(req.params.fileId);
    const { targetProjectId, targetFolder } = req.body;

    // Validate file exists
    const file = fileQueries.findById.get(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Validate file belongs to source project
    if (file.project_id !== projectId) {
      return res.status(403).json({ error: 'File does not belong to this project' });
    }

    // Update file's project and folder
    const updateQuery = db.prepare(`
      UPDATE files
      SET project_id = ?, folder = ?
      WHERE id = ?
    `);

    updateQuery.run(targetProjectId, targetFolder, fileId);

    res.json({ success: true, fileId, targetProjectId, targetFolder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
