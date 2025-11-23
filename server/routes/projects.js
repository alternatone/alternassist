const express = require('express');
const router = express.Router();
const multer = require('multer');
const { projectQueries, fileQueries, shareLinkQueries, db } = require('../models/database');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../../alternaview-config');
const folderSync = require('../services/folder-sync');
const { generateSecurePassword } = require('../utils/password-generator');
const transcoder = require('../services/transcoder');

// Get storage path configuration
router.get('/config/storage-path', (req, res) => {
  res.json({ storagePath: config.storagePath });
});

// Get all projects (admin view)
router.get('/', (req, res) => {
  try {
    // Single query with JOIN - much more efficient than N+1 queries
    const projects = projectQueries.getAllWithStats.all();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single project with stats (admin view)
router.get('/:id', (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const project = projectQueries.findById.get(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const stats = fileQueries.getStats.get(projectId);

    res.json({
      ...project,
      file_count: stats?.file_count || 0,
      total_size: stats?.total_size || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new project
router.post('/', (req, res) => {
  try {
    const {
      name,
      password,
      client_name,
      contact_email,
      status,
      notes,
      pinned,
      media_folder_path,
      password_protected,
      trt,
      music_coverage,
      timeline_start,
      timeline_end,
      estimated_total,
      estimated_taxes,
      net_after_taxes
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    // Check if project already exists
    const existing = projectQueries.findByName.get(name);
    if (existing) {
      return res.status(400).json({ error: 'Project with this name already exists' });
    }

    // Create project directory
    const projectPath = path.join(config.storagePath, name);
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // Generate password if not provided
    const plainPassword = password || generateSecurePassword();

    // Hash the password before storing
    const hashedPassword = bcrypt.hashSync(plainPassword, 10);

    // Insert project into database with all fields
    const result = projectQueries.create.run(
      name,
      hashedPassword,
      client_name || null,
      contact_email || null,
      status || 'prospects',
      notes || null,
      pinned ? 1 : 0,
      media_folder_path || null,
      password_protected ? 1 : 0,
      trt || null,
      music_coverage || 0,
      timeline_start || null,
      timeline_end || null,
      estimated_total || 0,
      estimated_taxes || 0,
      net_after_taxes || 0
    );

    // Store plaintext password for admin viewing
    db.prepare('UPDATE projects SET password_plaintext = ? WHERE id = ?').run(plainPassword, result.lastInsertRowid);

    res.json({
      id: result.lastInsertRowid,
      name,
      password: plainPassword, // Return unhashed password once for admin to share
      message: 'Project created successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

// Get current authenticated project
router.get('/current', (req, res) => {
  if (!req.session.projectId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const project = projectQueries.findById.get(req.session.projectId);

    if (!project) {
      req.session.destroy();
      return res.status(404).json({ error: 'Project not found' });
    }

    const stats = fileQueries.getStats.get(project.id);

    res.json({
      id: project.id,
      name: project.name,
      file_count: stats.file_count || 0,
      total_size: stats.total_size || 0
    });
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

// Update project (for Kanban board)
router.patch('/:id', (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const {
      name,
      client_name,
      contact_email,
      status,
      notes,
      pinned,
      media_folder_path,
      password_protected,
      password,
      trt,
      music_coverage,
      timeline_start,
      timeline_end,
      estimated_total,
      estimated_taxes,
      net_after_taxes
    } = req.body;

    const project = projectQueries.findById.get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Detect status change from 'prospects' to 'in-process' or 'in-review'
    const statusChanged = status !== undefined && status !== project.status;
    const movingToProduction = statusChanged &&
                                project.status === 'prospects' &&
                                (status === 'in-process' || status === 'in-review');

    let updatedPassword = password !== undefined ? password : project.password;
    let updatedMediaFolderPath = media_folder_path !== undefined ? media_folder_path : project.media_folder_path;

    // If moving to production, set up project folder and password
    if (movingToProduction) {
      // Create project folder if it doesn't exist
      const projectPath = path.join(config.storagePath, project.name);
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }

      // Set media folder path
      updatedMediaFolderPath = projectPath;

      // Generate password if none exists
      if (!project.password) {
        const plainPassword = generateSecurePassword();
        updatedPassword = bcrypt.hashSync(plainPassword, 10);
        // Note: We can't return the plain password here since this is a PATCH
        // The admin will need to regenerate if they didn't save the original
        console.log(`Generated password for ${project.name}: ${plainPassword}`);
      }

      // Start folder watcher for this project
      try {
        folderSync.startWatching(projectId, projectPath);
      } catch (error) {
        console.error(`Failed to start folder watcher for project ${projectId}:`, error);
      }
    }

    // Update with provided values or keep existing
    projectQueries.update.run(
      name !== undefined ? name : project.name,
      client_name !== undefined ? client_name : project.client_name,
      contact_email !== undefined ? contact_email : project.contact_email,
      status !== undefined ? status : project.status,
      notes !== undefined ? notes : project.notes,
      pinned !== undefined ? (pinned ? 1 : 0) : project.pinned,
      updatedMediaFolderPath,
      password_protected !== undefined ? (password_protected ? 1 : 0) : project.password_protected,
      updatedPassword,
      trt !== undefined ? trt : project.trt,
      music_coverage !== undefined ? music_coverage : project.music_coverage,
      timeline_start !== undefined ? timeline_start : project.timeline_start,
      timeline_end !== undefined ? timeline_end : project.timeline_end,
      estimated_total !== undefined ? estimated_total : project.estimated_total,
      estimated_taxes !== undefined ? estimated_taxes : project.estimated_taxes,
      net_after_taxes !== undefined ? net_after_taxes : project.net_after_taxes,
      projectId
    );

    res.json({ success: true, message: 'Project updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete project (admin only - add auth later)
router.delete('/:id', (req, res) => {
  try {
    const projectId = req.params.id;
    const project = projectQueries.findById.get(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete project directory
    const projectPath = path.join(config.storagePath, project.name);
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }

    // Delete from database (cascades to files and comments)
    projectQueries.delete.run(projectId);

    res.json({ success: true, message: 'Project deleted' });
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

    const folder = req.body.folder || 'TO AA';
    const projectPath = path.join(config.storagePath, project.name);
    const folderPath = path.join(projectPath, folder);

    // Create folder structure if it doesn't exist
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    cb(null, folderPath);
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
    const projectPath = path.join(config.storagePath, project.name);

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
    const project = projectQueries.findById.get(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate new password
    const plainPassword = generateSecurePassword();
    const hashedPassword = bcrypt.hashSync(plainPassword, 10);

    // Update database
    projectQueries.update.run(
      project.name,
      project.client_name,
      project.contact_email,
      project.status,
      project.notes,
      project.pinned,
      project.media_folder_path,
      project.password_protected,
      hashedPassword,
      project.trt,
      project.music_coverage,
      project.timeline_start,
      project.timeline_end,
      project.estimated_total,
      project.estimated_taxes,
      project.net_after_taxes,
      projectId
    );

    // Store plaintext password for admin viewing
    db.prepare('UPDATE projects SET password_plaintext = ? WHERE id = ?').run(plainPassword, projectId);

    res.json({
      success: true,
      password: plainPassword,
      message: 'Password regenerated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
