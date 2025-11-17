const express = require('express');
const router = express.Router();
const { accountingQueries } = require('../models/database');

// Get all accounting records
router.get('/', (req, res) => {
  try {
    const records = accountingQueries.getAll.all();
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get accounting records by project
router.get('/project/:projectId', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const records = accountingQueries.findByProject.all(projectId);
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
      return res.status(400).json({ error: 'transaction_type and amount are required' });
    }

    const result = accountingQueries.create.run(
      project_id || null,
      transaction_type,
      category || null,
      amount,
      transaction_date || null,
      description || null
    );

    const record = accountingQueries.findById.get(result.lastInsertRowid);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete accounting record
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    accountingQueries.delete.run(id);
    res.json({ success: true, message: 'Accounting record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
