const express = require('express');
const router = express.Router();
const { hoursLogQueries, projectQueries } = require('../models/database');

// Get all hours log entries
router.get('/', (req, res) => {
  try {
    const entries = hoursLogQueries.getAll.all();
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get hours log entries for a specific project
router.get('/project/:projectId', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const entries = hoursLogQueries.findByProject.all(projectId);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get total hours by category for a project
router.get('/project/:projectId/totals', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const totals = hoursLogQueries.getTotalByProject.all(projectId);
    const grandTotal = hoursLogQueries.getProjectTotal.get(projectId);
    res.json({
      by_category: totals,
      total_hours: grandTotal?.total_hours || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new hours log entry
router.post('/', (req, res) => {
  try {
    const { project_id, date, hours, category, description } = req.body;

    if (!project_id || !date || hours === undefined) {
      return res.status(400).json({ error: 'project_id, date, hours required' });
    }

    const result = hoursLogQueries.create.run(
      project_id, date, hours, category, description
    );

    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update hours log entry
router.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entry = hoursLogQueries.findById.get(id);
    if (!entry) return res.status(404).json({ error: 'Hours log entry not found' });

    const updates = { ...entry, ...req.body };
    hoursLogQueries.update.run(updates.date, updates.hours, updates.category, updates.description, id);

    res.json({ ...entry, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete hours log entry
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    hoursLogQueries.delete.run(id);
    res.json({ success: true, message: 'Hours log entry deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upsert cumulative hours by category for a project
// This endpoint handles updating cumulative totals from the kanban board
router.post('/project/:projectId/upsert-totals', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { music, dialogue, soundDesign, mix, revisions } = req.body;

    // Verify project exists
    const project = projectQueries.findById.get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    const categories = { music, dialogue, 'sound-design': soundDesign, mix, revisions };

    // Single query to get current totals by category
    const totals = hoursLogQueries.getTotalByProject.all(projectId);
    const totalMap = Object.fromEntries(totals.map(t => [t.category, t.total_hours || 0]));

    // Calculate differences and batch insert
    for (const [name, targetHours] of Object.entries(categories)) {
      const target = parseFloat(targetHours) || 0;
      if (target === 0) continue;

      const current = totalMap[name] || 0;
      const diff = target - current;

      if (diff !== 0) {
        hoursLogQueries.create.run(projectId, today, diff, name, 'Updated from kanban board');
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
