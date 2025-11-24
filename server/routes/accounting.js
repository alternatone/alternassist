const express = require('express');
const router = express.Router();
const { accountingQueries } = require('../models/database');
const cache = require('../utils/cache');

// Get all accounting records
router.get('/', (req, res) => {
  try {
    const records = cache.wrap(
      'accounting:all',
      () => accountingQueries.getAll.all(),
      60000  // 1 minute cache
    );
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get accounting records by project
router.get('/project/:projectId', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const records = cache.wrap(
      `accounting:project:${projectId}`,
      () => accountingQueries.findByProject.all(projectId),
      60000  // 1 minute cache
    );
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new accounting record
router.post('/', (req, res) => {
  try {
    const { project_id, transaction_type, category, amount, transaction_date, description } = req.body;

    if (!transaction_type || !amount) {
      return res.status(400).json({ error: 'transaction_type and amount required' });
    }

    const result = accountingQueries.create.run(
      project_id, transaction_type, category, amount, transaction_date, description
    );

    // Invalidate caches
    cache.invalidate('accounting:all');
    if (project_id) {
      cache.invalidate(`accounting:project:${project_id}`);
    }

    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete accounting record
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    accountingQueries.delete.run(id);

    // Invalidate caches (invalidate all project caches since we don't know which project)
    cache.invalidate('accounting:all');
    cache.invalidatePattern('accounting:project:');

    res.json({ success: true, message: 'Accounting record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
