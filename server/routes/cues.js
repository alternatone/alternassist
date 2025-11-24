const express = require('express');
const router = express.Router();
const { cueQueries, projectQueries } = require('../models/database');
const cache = require('../utils/cache');

// Get all cues
router.get('/', (req, res) => {
  try {
    const cues = cueQueries.getAll.all();
    res.json(cues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cues for a specific project (with caching)
router.get('/project/:projectId', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const cues = cache.wrap(
      `cues:project:${projectId}`,
      () => cueQueries.findByProject.all(projectId),
      30000  // 30 second cache
    );
    res.json(cues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cue statistics for a project (optimized for kanban board)
router.get('/project/:projectId/stats', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const stats = cache.wrap(
      `cues:project:${projectId}:stats`,
      () => cueQueries.getCueStatsByProject.get(projectId),
      30000  // 30 second cache
    );
    res.json(stats || {
      to_write: 0,
      written: 0,
      revisions: 0,
      approved: 0,
      approved_minutes: 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new cue
router.post('/', (req, res) => {
  try {
    const { project_id, cue_number = '', title = '', status = 'to-write',
            duration, notes, start_time, end_time, theme, version } = req.body;

    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    const result = cueQueries.create.run(
      project_id, cue_number, title, status, duration, notes,
      start_time, end_time, theme, version
    );

    // Invalidate cache for this project
    cache.invalidate(`cues:project:${project_id}`);
    cache.invalidate(`cues:project:${project_id}:stats`);
    cache.invalidate(`projects:kanban-data:${project_id}`);

    res.json({ id: result.lastInsertRowid, project_id, ...req.body });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update cue
router.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cue = cueQueries.findById.get(id);
    if (!cue) return res.status(404).json({ error: 'Cue not found' });

    const updates = { ...cue, ...req.body };
    cueQueries.update.run(
      updates.cue_number, updates.title, updates.status, updates.duration,
      updates.notes, updates.start_time, updates.end_time, updates.theme,
      updates.version, id
    );

    // Invalidate cache for this project
    cache.invalidate(`cues:project:${cue.project_id}`);
    cache.invalidate(`cues:project:${cue.project_id}:stats`);
    cache.invalidate(`projects:kanban-data:${cue.project_id}`);

    res.json({ ...cue, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete cue
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cue = cueQueries.findById.get(id);
    if (cue) {
      cueQueries.delete.run(id);
      // Invalidate cache for this project
      cache.invalidate(`cues:project:${cue.project_id}`);
      cache.invalidate(`cues:project:${cue.project_id}:stats`);
      cache.invalidate(`projects:kanban-data:${cue.project_id}`);
    }
    res.json({ success: true, message: 'Cue deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all cues for a project
router.delete('/project/:projectId', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    cueQueries.deleteByProject.run(projectId);

    // Invalidate cache for this project
    cache.invalidate(`cues:project:${projectId}`);
    cache.invalidate(`cues:project:${projectId}:stats`);
    cache.invalidate(`projects:kanban-data:${projectId}`);

    res.json({ success: true, message: 'Project cues deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
