const express = require('express');
const router = express.Router();
const multer = require('multer');
const { projectQueries, fileQueries, shareLinkQueries, scopeQueries, estimateQueries, db } = require('../models/database');
const { requireAdmin } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../../alternaview-config');
const folderSync = require('../services/folder-sync');
const { generateSecurePassword } = require('../utils/password-generator');
const transcoder = require('../services/transcoder');
const cache = require('../utils/cache');

// Get storage path configuration
router.get('/config/storage-path', (req, res) => {
  res.json({ storagePath: config.storagePath });
});

// Get all projects (admin view) - with caching
router.get('/', (req, res) => {
  try {
    const projects = cache.wrap('projects:all', () => projectQueries.getAllWithStats.all());
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get projects with music scope (optimized for cue tracker)
router.get('/with-music', (req, res) => {
  try {
    const projects = cache.wrap(
      'projects:with-music',
      () => projectQueries.getAllWithMusicScope.all(),
      60000  // 1 minute cache
    );
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all projects with scope (optimized for kanban board)
router.get('/with-scope', (req, res) => {
  try {
    const projects = cache.wrap(
      'projects:with-scope',
      () => projectQueries.getAllWithScope.all(),
      60000  // 1 minute cache
    );
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single project with aggregated kanban data (optimized)
router.get('/:id/kanban-data', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = cache.wrap(
      `projects:kanban-data:${id}`,
      () => projectQueries.getKanbanData.get(id),
      30000  // 30 second cache
    );

    if (!data) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single project with stats (admin view) - optimized single query
router.get('/:id', (req, res) => {
  try {
    const project = projectQueries.getWithStats.get(parseInt(req.params.id));
    if (!project) return res.status(404).json({ error: 'Project not found' });

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to sanitize folder names
function sanitizeFolderName(name) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_');
}

// Helper function to ensure FTP drive is available
function ensureFTPAvailable() {
  if (!fs.existsSync(config.storagePath)) {
    throw new Error('FTP drive not mounted. Please connect external drive.');
  }
}

// Create new project
router.post('/', requireAdmin, (req, res) => {
  try {
    const { name, password, client_name, contact_email, status = 'prospects',
            notes, pinned = 0, media_folder_path, password_protected = 0,
            trt, music_coverage = 0, timeline_start, timeline_end,
            estimated_total = 0, estimated_taxes = 0, net_after_taxes = 0,
            folder_path } = req.body;

    if (!name) return res.status(400).json({ error: 'Project name is required' });

    // Ensure FTP drive is available
    try {
      ensureFTPAvailable();
    } catch (error) {
      return res.status(503).json({
        error: 'FTP drive not available',
        suggestion: 'Please connect the FTP1 external drive and try again.'
      });
    }

    // Use folder_path if provided, otherwise sanitize name
    const safeFolderPath = folder_path ? path.basename(folder_path) : sanitizeFolderName(name);

    // Check if folder already in use
    const existing = db.prepare(
      'SELECT id FROM projects WHERE folder_path = ?'
    ).get(safeFolderPath);

    if (existing) {
      return res.status(400).json({ error: 'Folder path already in use by another project' });
    }

    const plainPassword = password || generateSecurePassword();
    const hashedPassword = bcrypt.hashSync(plainPassword, 10);

    const result = projectQueries.createWithPlaintext.run(
      name, hashedPassword, plainPassword,
      client_name, contact_email, status, notes, pinned ? 1 : 0,
      media_folder_path, password_protected ? 1 : 0,
      trt, music_coverage, timeline_start, timeline_end,
      estimated_total, estimated_taxes, net_after_taxes
    );

    const projectId = result.lastInsertRowid;

    // Update folder_path in database
    db.prepare('UPDATE projects SET folder_path = ? WHERE id = ?').run(safeFolderPath, projectId);

    // Create folder structure on FTP drive
    const ftpPath = path.join(config.storagePath, safeFolderPath);
    fs.mkdirSync(path.join(ftpPath, 'TO AA'), { recursive: true });
    fs.mkdirSync(path.join(ftpPath, 'FROM AA'), { recursive: true });

    // Invalidate cache
    cache.invalidate('projects:all');
    cache.invalidate('projects:with-scope');

    res.json({
      id: projectId,
      name,
      folder_path: safeFolderPath,
      password: plainPassword
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Create project with estimate (unified transaction endpoint for estimate calculator)
router.post('/with-estimate', (req, res) => {
  try {
    const { project, scope, estimate } = req.body;

    if (!project || !project.name) {
      return res.status(400).json({ error: 'Project data with name is required' });
    }

    // Ensure FTP drive is available
    try {
      ensureFTPAvailable();
    } catch (error) {
      return res.status(503).json({
        error: 'FTP drive not available',
        suggestion: 'Please connect the FTP1 external drive and try again.'
      });
    }

    // Generate folder path
    const safeFolderPath = project.folder_path ? path.basename(project.folder_path) : sanitizeFolderName(project.name);

    // Check if folder already in use
    const existing = db.prepare(
      'SELECT id FROM projects WHERE folder_path = ?'
    ).get(safeFolderPath);

    if (existing) {
      return res.status(400).json({ error: 'Folder path already in use by another project' });
    }

    // Use transaction for atomicity
    const createProject = db.transaction(() => {
      // 1. Create project
      const plainPassword = project.password || 'default';
      const hashedPassword = bcrypt.hashSync(plainPassword, 10);

      const result = projectQueries.createWithPlaintext.run(
        project.name,
        hashedPassword,
        plainPassword,
        project.client_name || null,
        project.contact_email || null,
        project.status || 'prospects',
        project.notes || null,
        project.pinned ? 1 : 0,
        project.media_folder_path || null,
        project.password_protected ? 1 : 0,
        project.trt || null,
        project.music_coverage || 0,
        project.timeline_start || null,
        project.timeline_end || null,
        project.estimated_total || 0,
        project.estimated_taxes || 0,
        project.net_after_taxes || 0
      );

      const projectId = result.lastInsertRowid;

      // Update folder_path in database
      db.prepare('UPDATE projects SET folder_path = ? WHERE id = ?').run(safeFolderPath, projectId);

      // 2. Create scope if provided
      if (scope) {
        scopeQueries.upsert.run(
          projectId,
          scope.contact_email || null,
          scope.music_minutes || 0,
          scope.dialogue_hours || 0,
          scope.sound_design_hours || 0,
          scope.mix_hours || 0,
          scope.revision_hours || 0
        );
      }

      // 3. Create estimate if provided
      if (estimate) {
        estimateQueries.create.run(
          projectId,
          estimate.runtime || 0,
          estimate.music_minutes || 0,
          estimate.dialogue_hours || 0,
          estimate.sound_design_hours || 0,
          estimate.mix_hours || 0,
          estimate.revision_hours || 0,
          estimate.post_days || 0,
          estimate.bundle_discount ? 1 : 0,
          estimate.music_cost || 0,
          estimate.post_cost || 0,
          estimate.discount_amount || 0,
          estimate.total_cost || 0
        );
      }

      return projectId;
    });

    const projectId = createProject();

    // Create folder structure on FTP drive
    const ftpPath = path.join(config.storagePath, safeFolderPath);
    fs.mkdirSync(path.join(ftpPath, 'TO AA'), { recursive: true });
    fs.mkdirSync(path.join(ftpPath, 'FROM AA'), { recursive: true });

    // Invalidate cache
    cache.invalidate('projects:all');

    res.json({
      success: true,
      project_id: projectId,
      folder_path: safeFolderPath,
      message: 'Project, scope, and estimate created successfully'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Authenticate to a project
router.post('/auth', (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ error: 'Name and password are required' });
    }

    const project = projectQueries.findByName.get(name);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Compare hashed password
    const passwordMatch = bcrypt.compareSync(password, project.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Store project access in session
    req.session.projectId = project.id;
    req.session.projectName = project.name;

    res.json({
      success: true,
      project: {
        id: project.id,
        name: project.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current authenticated project (optimized single query)
router.get('/current', (req, res) => {
  if (!req.session.projectId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const project = projectQueries.getWithStats.get(req.session.projectId);

    if (!project) {
      req.session.destroy();
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout from project
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true });
  });
});

// Update project (for Kanban board) - No auth required for Electron app
router.patch('/:id', (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const project = projectQueries.findById.get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const updates = { ...project, ...req.body, id: projectId };
    const movingToProduction = project.status === 'prospects' &&
                                ['in-process', 'in-review'].includes(updates.status);

    if (movingToProduction) {
      // Use folder_path if available, otherwise sanitize name
      const folderPath = project.folder_path || sanitizeFolderName(project.name);
      const projectPath = path.join(config.storagePath, folderPath);
      updates.media_folder_path = projectPath;

      if (!project.password) {
        const plainPassword = generateSecurePassword();
        updates.password = bcrypt.hashSync(plainPassword, 10);
      }

      // Non-blocking operations
      setImmediate(() => {
        fs.mkdir(path.join(projectPath, 'TO AA'), { recursive: true }, () => {});
        fs.mkdir(path.join(projectPath, 'FROM AA'), { recursive: true }, () =>
          folderSync.startWatching(projectId, projectPath).catch(() => {})
        );
      });
    }

    projectQueries.update.run(
      updates.name, updates.client_name, updates.contact_email,
      updates.status, updates.notes, updates.pinned ? 1 : 0,
      updates.media_folder_path, updates.password_protected ? 1 : 0,
      updates.password, updates.trt, updates.music_coverage,
      updates.timeline_start, updates.timeline_end,
      updates.estimated_total, updates.estimated_taxes,
      updates.net_after_taxes, projectId
    );

    // Invalidate cache
    cache.invalidate('projects:all');
    cache.invalidate('projects:with-scope');
    cache.invalidate(`projects:kanban-data:${projectId}`);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete project (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const project = projectQueries.findById.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    projectQueries.delete.run(req.params.id);

    // Non-blocking filesystem cleanup - use folder_path if available
    const folderPath = project.folder_path || sanitizeFolderName(project.name);
    fs.rm(path.join(config.storagePath, folderPath),
          { recursive: true, force: true }, () => {});

    // Invalidate cache
    cache.invalidate('projects:all');

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign folder to project
router.post('/:id/assign-folder', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const { folderPath } = req.body;

    if (!folderPath) {
      return res.status(400).json({ error: 'Folder path is required' });
    }

    // Security: Ensure folder is within configured storage path
    if (!folderPath.startsWith(config.storagePath)) {
      return res.status(400).json({ error: `Folder must be within ${config.storagePath}` });
    }

    // Verify folder exists
    if (!fs.existsSync(folderPath)) {
      return res.status(400).json({ error: 'Folder does not exist' });
    }

    // Update project
    projectQueries.updateMediaFolder.run(folderPath, projectId);

    // Sync folder contents
    const syncResult = await folderSync.syncFolder(projectId, folderPath);

    // Start watching folder
    folderSync.startWatching(projectId, folderPath);

    res.json({ success: true, ...syncResult });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync folder manually
router.post('/:id/sync-folder', async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const project = projectQueries.findById.get(projectId);

    if (!project || !project.media_folder_path) {
      return res.status(400).json({ error: 'Project has no assigned folder' });
    }

    const syncResult = await folderSync.syncFolder(projectId, project.media_folder_path);
    res.json(syncResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate share link for project
router.post('/:id/generate-share-link', (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const project = projectQueries.findById.get(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Check if share link already exists
    const existing = shareLinkQueries.findByProject.get(projectId);
    if (existing) {
      // Return existing link
      return res.json({
        token: existing.token,
        url: `/share/project/${projectId}?token=${existing.token}`
      });
    }

    // Create share link
    shareLinkQueries.create.run(projectId, null, token);

    res.json({
      token,
      url: `/share/project/${projectId}?token=${token}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Configure multer for project uploads
const projectUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = parseInt(req.params.id);
    const project = projectQueries.findById.get(projectId);

    if (!project) {
      return cb(new Error('Project not found'));
    }

    // Ensure FTP drive is available
    try {
      ensureFTPAvailable();
    } catch (error) {
      return cb(error);
    }

    const folder = req.body.folder || 'TO AA';
    const folderPath = project.folder_path || sanitizeFolderName(project.name);
    const projectPath = path.join(config.storagePath, folderPath);
    const uploadPath = path.join(projectPath, folder);

    // Create folder structure if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

const projectUpload = multer({
  storage: projectUploadStorage,
  limits: { fileSize: config.maxFileSize }
});

// Get files for a specific project (admin/no-auth access)
router.get('/:id/files', (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const project = projectQueries.findById.get(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const files = fileQueries.findByProject.all(projectId);
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload file to a specific project (admin access)
router.post('/:id/upload', projectUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const projectId = parseInt(req.params.id);
    const project = projectQueries.findById.get(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const folder = req.body.folder || 'TO AA';
    const folderPath = project.folder_path || sanitizeFolderName(project.name);
    const projectPath = path.join(config.storagePath, folderPath);

    // Insert file record into database
    const result = fileQueries.create.run(
      projectId,
      req.file.filename,
      req.file.originalname,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      null, // duration
      null, // transcoded_file_path
      folder
    );

    const fileId = result.lastInsertRowid;

    // Update project timestamp
    projectQueries.updateTimestamp.run(projectId);

    // Send response
    res.json({
      success: true,
      file: {
        id: fileId,
        name: req.file.originalname,
        size: req.file.size,
        folder: folder
      }
    });

    // Transcode video in background
    if (req.file.mimetype.startsWith('video/')) {
      transcoder.processVideoFile(req.file.path, projectPath, req.file.originalname)
        .then((transcodedPath) => {
          if (transcodedPath) {
            fileQueries.updateTranscodedPath.run(transcodedPath, fileId);
          }
        })
        .catch((error) => {
          console.error(`Transcode failed for file ${fileId}:`, error.message);
        });
    }
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Get plaintext password for a project (admin only)
router.get('/:id/password', (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const project = db.prepare('SELECT password_plaintext FROM projects WHERE id = ?').get(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.password_plaintext) {
      return res.status(404).json({ error: 'Password not available. Use "Regenerate password" to create a new one.' });
    }

    res.json({
      success: true,
      password: project.password_plaintext
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Regenerate password for a project
router.post('/:id/regenerate-password', (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    if (!projectQueries.findById.get(projectId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const plainPassword = generateSecurePassword();
    const hashedPassword = bcrypt.hashSync(plainPassword, 10);

    projectQueries.updatePassword.run(hashedPassword, plainPassword, projectId);

    res.json({ success: true, password: plainPassword });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PHASE 2: Activity logging endpoints

// Get activity log for a project
router.get('/:id/activity', requireAdmin, (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 100;

    const ActivityTracker = require('../services/activity-tracker');
    const activities = ActivityTracker.getProjectActivity(projectId, limit);

    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PHASE 3: Get unbilled files for a project
router.get('/:id/unbilled-files', requireAdmin, (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const { deliverableQueries } = require('../models/database');
    const unbilledFiles = deliverableQueries.getUnbilledFiles.all(projectId);

    res.json(unbilledFiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get billable comments for a project
router.get('/:id/billable-comments', requireAdmin, (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const { commentQueries } = require('../models/database');
    const billableComments = commentQueries.getBillableByProject.all(projectId);

    res.json(billableComments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
