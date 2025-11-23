const express = require('express');
const router = express.Router();
const { paymentQueries, invoiceQueries, projectQueries } = require('../models/database');

// Get all payments
router.get('/', (req, res) => {
  try {
    const payments = paymentQueries.getAll.all();
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get payments for a specific project
router.get('/project/:projectId', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const payments = paymentQueries.findByProject.all(projectId);
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get payments for a specific invoice
router.get('/invoice/:invoiceId', (req, res) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    const payments = paymentQueries.findByInvoice.all(invoiceId);
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new payment
router.post('/', (req, res) => {
  try {
    const { invoice_id, project_id, amount, payment_date,
            payment_method, payment_type, notes } = req.body;

    if (!project_id || !amount) {
      return res.status(400).json({ error: 'project_id and amount required' });
    }

    const result = paymentQueries.create.run(
      invoice_id, project_id, amount, payment_date,
      payment_method, payment_type, notes
    );

    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete payment
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    paymentQueries.delete.run(id);
    res.json({ success: true, message: 'Payment deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
