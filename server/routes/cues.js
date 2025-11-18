const express = require('express');
const router = express.Router();
const { cueQueries, projectQueries } = require('../models/database');

// Get all cues
router.get('/', (req, res) => {
  try {
    const cues = cueQueries.getAll.all();
    res.json(cues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cues for a specific project
router.get('/project/:projectId', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const cues = cueQueries.findByProject.all(projectId);
    res.json(cues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new cue
router.post('/', (req, res) => {
  try {
    const {
      project_id,
      cue_number,
      title,
      status,
      duration,
      notes,
      start_time,
      end_time,
      theme,
      version
    } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Verify project exists
    const project = projectQueries.findById.get(project_id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = cueQueries.create.run(
      project_id,
      cue_number || '',
      title || '',
      status || 'to-write',
      duration || null,
      notes || null,
      start_time || null,
      end_time || null,
      theme || null,
      version || null
    );

    const cue = cueQueries.findById.get(result.lastInsertRowid);
    res.json(cue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update cue
router.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`PATCH /api/cues/${id}`, req.body);
    const {
      cue_number,
      title,
      status,
      duration,
      notes,
      start_time,
      end_time,
      theme,
      version
    } = req.body;

    const cue = cueQueries.findById.get(id);
    if (!cue) {
      return res.status(404).json({ error: 'Cue not found' });
    }

    cueQueries.update.run(
      cue_number !== undefined ? cue_number : cue.cue_number,
      title !== undefined ? title : cue.title,
      status !== undefined ? status : cue.status,
      duration !== undefined ? duration : cue.duration,
      notes !== undefined ? notes : cue.notes,
      start_time !== undefined ? start_time : cue.start_time,
      end_time !== undefined ? end_time : cue.end_time,
      theme !== undefined ? theme : cue.theme,
      version !== undefined ? version : cue.version,
      id
    );

    const updatedCue = cueQueries.findById.get(id);
    res.json(updatedCue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete cue
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    cueQueries.delete.run(id);
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
    res.json({ success: true, message: 'Project cues deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
