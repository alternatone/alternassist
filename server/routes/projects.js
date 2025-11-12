const express = require('express');
const router = express.Router();
const { projectQueries, fileQueries, shareLinkQueries } = require('../models/database');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../../alternaview-config');
const folderSync = require('../services/folder-sync');

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

// Create new project
router.post('/', (req, res) => {
  try {
    const {
      name,
      password,
      client_name,
      status,
      notes,
      pinned,
      media_folder_path,
      password_protected
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

    // Insert project into database with all Kanban fields
    const result = projectQueries.create.run(
      name,
      password || null,
      client_name || null,
      status || 'prospects',
      notes || null,
      pinned ? 1 : 0,
      media_folder_path || null,
      password_protected ? 1 : 0
    );

    res.json({
      id: result.lastInsertRowid,
      name,
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

    if (project.password !== password) {
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
      status,
      notes,
      pinned,
      media_folder_path,
      password_protected,
      password
    } = req.body;

    const project = projectQueries.findById.get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Update with provided values or keep existing
    projectQueries.update.run(
      name !== undefined ? name : project.name,
      client_name !== undefined ? client_name : project.client_name,
      status !== undefined ? status : project.status,
      notes !== undefined ? notes : project.notes,
      pinned !== undefined ? (pinned ? 1 : 0) : project.pinned,
      media_folder_path !== undefined ? media_folder_path : project.media_folder_path,
      password_protected !== undefined ? (password_protected ? 1 : 0) : project.password_protected,
      password !== undefined ? password : project.password,
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

    // Security: Ensure folder is within /Volumes/FTP1
    if (!folderPath.startsWith('/Volumes/FTP1')) {
      return res.status(400).json({ error: 'Folder must be within /Volumes/FTP1' });
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

module.exports = router;
