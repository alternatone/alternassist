const express = require('express');
const router = express.Router();
const { invoiceQueries, paymentQueries, projectQueries } = require('../models/database');

// Get all invoices
router.get('/', (req, res) => {
  try {
    const invoices = invoiceQueries.getAll.all();
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get invoices for a specific project
router.get('/project/:projectId', (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const invoices = invoiceQueries.findByProject.all(projectId);
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single invoice by ID (optimized with JSON_GROUP_ARRAY)
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = invoiceQueries.getWithPayments.get(id);

    if (!data) return res.status(404).json({ error: 'Invoice not found' });

    // Parse JSON aggregated payments
    const { payments_json, ...invoice } = data;
    res.json({ ...invoice, payments: JSON.parse(payments_json || '[]') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new invoice
router.post('/', (req, res) => {
  try {
    const { project_id, invoice_number, amount = 0, deposit_amount = 0,
            deposit_percentage = 0, final_amount = 0, status = 'draft',
            due_date, issue_date, line_items = [] } = req.body;

    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    const lineItemsJson = typeof line_items === 'string' ? line_items : JSON.stringify(line_items);
    const result = invoiceQueries.create.run(
      project_id, invoice_number, amount, deposit_amount, deposit_percentage,
      final_amount, status, due_date, issue_date, lineItemsJson
    );

    res.json({ id: result.lastInsertRowid, project_id, ...req.body });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update invoice
router.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const invoice = invoiceQueries.findById.get(id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const updates = { ...invoice, ...req.body };
    updates.line_items = typeof updates.line_items === 'string'
      ? updates.line_items
      : JSON.stringify(updates.line_items);

    invoiceQueries.update.run(
      updates.invoice_number, updates.amount, updates.deposit_amount,
      updates.deposit_percentage, updates.final_amount, updates.status,
      updates.due_date, updates.issue_date, updates.line_items, id
    );

    res.json({ ...invoice, ...req.body, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete invoice
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    invoiceQueries.delete.run(id);
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
