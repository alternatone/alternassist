const express = require('express');
const router = express.Router();
const { invoiceQueries, paymentQueries, projectQueries, db } = require('../models/database');
const cache = require('../utils/cache');

// Get all invoices with project info (optimized - single query with JOIN)
router.get('/with-projects', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const invoices = cache.wrap(
      `invoices:with-projects:${limit}`,
      () => invoiceQueries.getAllWithProjects.all(limit),
      30000  // 30 second cache
    );
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get next invoice number (optimized - database MAX() query)
router.get('/next-number', (req, res) => {
  try {
    const result = invoiceQueries.getNextInvoiceNumber.get();
    const maxNumber = result?.max_num || 2522;
    const nextNumber = '25' + String(maxNumber + 1).padStart(2, '0');

    res.json({ nextNumber, currentMax: maxNumber });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// Get single invoice with project info (optimized - single query with JOIN)
router.get('/:id/with-project', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = invoiceQueries.getWithProject.get(id);

    if (!data) return res.status(404).json({ error: 'Invoice not found' });

    const { payments_json, ...invoice } = data;
    res.json({ ...invoice, payments: JSON.parse(payments_json || '[]') });
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

    // Invalidate cache
    cache.invalidatePattern('invoices:with-projects:');

    res.json({ id: result.lastInsertRowid, project_id, ...req.body });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Create invoice with payment (unified transaction endpoint)
router.post('/with-payment', (req, res) => {
  try {
    const { invoice, payment, updateProject } = req.body;

    if (!invoice || !payment) {
      return res.status(400).json({ error: 'Invoice and payment data required' });
    }

    // Use transaction for atomicity
    const createInvoiceWithPayment = db.transaction(() => {
      // 1. Create invoice
      const lineItemsJson = typeof invoice.line_items === 'string'
        ? invoice.line_items
        : JSON.stringify(invoice.line_items);

      const invoiceResult = invoiceQueries.create.run(
        invoice.project_id,
        invoice.invoice_number,
        invoice.amount,
        invoice.deposit_amount || 0,
        invoice.deposit_percentage || 0,
        invoice.final_amount || 0,
        invoice.status || 'sent',
        invoice.due_date,
        invoice.issue_date,
        lineItemsJson
      );

      const invoiceId = invoiceResult.lastInsertRowid;

      // 2. Create payment record
      paymentQueries.create.run(
        invoiceId,
        payment.project_id,
        payment.amount,
        payment.payment_date || null,
        payment.payment_method || null,
        payment.payment_type || 'final',
        payment.notes || ''
      );

      // 3. Update project status if requested
      if (updateProject && updateProject.project_id && updateProject.status) {
        const updateStatus = db.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        updateStatus.run(updateProject.status, updateProject.project_id);
      }

      return invoiceId;
    });

    const invoiceId = createInvoiceWithPayment();

    // Invalidate caches
    cache.invalidatePattern('invoices:with-projects:');
    cache.invalidate('projects:all');

    res.json({
      success: true,
      invoice_id: invoiceId,
      message: 'Invoice and payment created successfully'
    });
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

    // Invalidate cache
    cache.invalidatePattern('invoices:with-projects:');

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

    // Invalidate cache
    cache.invalidatePattern('invoices:with-projects:');

    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
