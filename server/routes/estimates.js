const express = require('express');
const router = express.Router();
const { estimateQueries, scopeQueries, projectQueries } = require('../models/database');

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
    const {
      project_id,
      runtime,
      music_minutes,
      dialogue_hours,
      sound_design_hours,
      mix_hours,
      revision_hours,
      post_days,
      bundle_discount,
      music_cost,
      post_cost,
      discount_amount,
      total_cost
    } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Verify project exists
    const project = projectQueries.findById.get(project_id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = estimateQueries.create.run(
      project_id,
      runtime || null,
      music_minutes || 0,
      dialogue_hours || 0,
      sound_design_hours || 0,
      mix_hours || 0,
      revision_hours || 0,
      post_days || 0,
      bundle_discount ? 1 : 0,
      music_cost || 0,
      post_cost || 0,
      discount_amount || 0,
      total_cost || 0
    );

    const estimate = estimateQueries.findById.get(result.lastInsertRowid);
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
