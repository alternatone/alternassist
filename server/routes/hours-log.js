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
      return res.status(400).json({ error: 'project_id, date, and hours are required' });
    }

    // Verify project exists
    const project = projectQueries.findById.get(project_id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = hoursLogQueries.create.run(
      project_id,
      date,
      hours,
      category || null,
      description || null
    );

    const entry = hoursLogQueries.findById.get(result.lastInsertRowid);
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update hours log entry
router.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { date, hours, category, description } = req.body;

    const entry = hoursLogQueries.findById.get(id);
    if (!entry) {
      return res.status(404).json({ error: 'Hours log entry not found' });
    }

    hoursLogQueries.update.run(
      date !== undefined ? date : entry.date,
      hours !== undefined ? hours : entry.hours,
      category !== undefined ? category : entry.category,
      description !== undefined ? description : entry.description,
      id
    );

    const updatedEntry = hoursLogQueries.findById.get(id);
    res.json(updatedEntry);
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
    const categories = [
      { name: 'music', hours: parseFloat(music) || 0 },
      { name: 'dialogue', hours: parseFloat(dialogue) || 0 },
      { name: 'sound-design', hours: parseFloat(soundDesign) || 0 },
      { name: 'mix', hours: parseFloat(mix) || 0 },
      { name: 'revisions', hours: parseFloat(revisions) || 0 }
    ];

    // For each category, get existing total and calculate difference
    for (const cat of categories) {
      if (cat.hours === 0) continue;

      const existingEntries = hoursLogQueries.findByProject.all(projectId)
        .filter(entry => entry.category === cat.name);

      const existingTotal = existingEntries.reduce((sum, entry) => sum + entry.hours, 0);
      const difference = cat.hours - existingTotal;

      if (difference !== 0) {
        // Create a new entry with the difference
        hoursLogQueries.create.run(
          projectId,
          today,
          difference,
          cat.name,
          'Updated from kanban board'
        );
      }
    }

    res.json({ success: true, message: 'Hours updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
