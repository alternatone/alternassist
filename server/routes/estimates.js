const express = require('express');
const router = express.Router();
const { estimateQueries, scopeQueries, projectQueries } = require('../models/database');

// Get all estimates with project info (optimized - single query with JOIN)
router.get('/with-projects', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const estimates = estimateQueries.getAllWithProjects.all(limit);
    res.json(estimates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all estimates
router.get('/', (req, res) => {
  try {
    const estimates = estimateQueries.getAll.all();
    res.json(estimates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get estimates for a specific project
router.get('/project/:projectId', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const estimates = estimateQueries.findByProject.all(projectId);
    res.json(estimates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new estimate
router.post('/', (req, res) => {
  try {
    const { project_id, runtime, music_minutes = 0, dialogue_hours = 0,
            sound_design_hours = 0, mix_hours = 0, revision_hours = 0,
            post_days = 0, bundle_discount = 0, music_cost = 0,
            post_cost = 0, discount_amount = 0, total_cost = 0 } = req.body;

    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    const result = estimateQueries.create.run(
      project_id, runtime, music_minutes, dialogue_hours, sound_design_hours,
      mix_hours, revision_hours, post_days, bundle_discount ? 1 : 0,
      music_cost, post_cost, discount_amount, total_cost
    );

    res.json({ id: result.lastInsertRowid, project_id, ...req.body });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get single estimate with project info (optimized - single query with JOIN)
router.get('/:id/with-project', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const estimate = estimateQueries.getWithProject.get(id);

    if (!estimate) {
      return res.status(404).json({ error: 'Estimate not found' });
    }

    res.json(estimate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete estimate
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    estimateQueries.delete.run(id);
    res.json({ success: true, message: 'Estimate deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get or create project scope
router.get('/scope/:projectId', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const scope = scopeQueries.findByProject.get(projectId);

    if (!scope) {
      return res.json({
        project_id: projectId,
        contact_email: '',
        music_minutes: 0,
        dialogue_hours: 0,
        sound_design_hours: 0,
        mix_hours: 0,
        revision_hours: 0
      });
    }

    res.json(scope);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create or update project scope
router.post('/scope', (req, res) => {
  try {
    const {
      project_id,
      contact_email,
      music_minutes,
      dialogue_hours,
      sound_design_hours,
      mix_hours,
      revision_hours
    } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Upsert scope data
    scopeQueries.upsert.run(
      project_id,
      contact_email || null,
      music_minutes || 0,
      dialogue_hours || 0,
      sound_design_hours || 0,
      mix_hours || 0,
      revision_hours || 0
    );

    const scope = scopeQueries.findByProject.get(project_id);
    res.json(scope);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
