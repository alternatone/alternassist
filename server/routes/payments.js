const express = require('express');
const router = express.Router();
const { paymentQueries, invoiceQueries, projectQueries, db } = require('../models/database');
const cache = require('../utils/cache');

// Get all payments
router.get('/', (req, res) => {
  try {
    const payments = paymentQueries.getAll.all();
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all payments with project names (optimized for accounting.html)
router.get('/with-projects', (req, res) => {
  try {
    const payments = cache.wrap(
      'payments:with-projects',
      () => paymentQueries.getAllWithProjects.all(),
      60000  // 1 minute cache
    );
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

    // Invalidate cache
    cache.invalidate('payments:with-projects');

    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Mark invoice as paid (transactional endpoint for payment_dashboard.html)
router.post('/mark-invoice-paid', (req, res) => {
  const { invoice_id, payment } = req.body;

  if (!invoice_id || !payment) {
    return res.status(400).json({ error: 'invoice_id and payment required' });
  }

  try {
    // Use database transaction for atomicity
    const result = db.transaction(() => {
      // Update invoice status
      invoiceQueries.update.run(
        invoiceQueries.findById.get(invoice_id).project_id,
        invoiceQueries.findById.get(invoice_id).invoice_number,
        invoiceQueries.findById.get(invoice_id).amount,
        invoiceQueries.findById.get(invoice_id).deposit_amount,
        invoiceQueries.findById.get(invoice_id).deposit_percentage,
        invoiceQueries.findById.get(invoice_id).final_amount,
        'paid',  // status
        invoiceQueries.findById.get(invoice_id).due_date,
        invoiceQueries.findById.get(invoice_id).issue_date,
        invoiceQueries.findById.get(invoice_id).line_items,
        invoice_id
      );

      // Create payment record
      const paymentResult = paymentQueries.create.run(
        invoice_id,
        payment.project_id,
        payment.amount,
        payment.payment_date,
        payment.payment_method,
        payment.payment_type || payment.payment_method,
        payment.notes || ''
      );

      // Get invoice to check deposit_percentage
      const invoice = invoiceQueries.findById.get(invoice_id);

      // Update project status based on deposit
      const newProjectStatus = invoice.deposit_percentage === 100 ? 'completed' : 'active';
      const project = projectQueries.findById.get(payment.project_id);

      projectQueries.update.run(
        project.name,
        project.client_name,
        project.contact_email,
        newProjectStatus,
        project.notes,
        project.pinned,
        project.media_folder_path,
        project.password_protected,
        project.password,
        project.trt,
        project.music_coverage,
        project.timeline_start,
        project.timeline_end,
        project.estimated_total,
        project.estimated_taxes,
        project.net_after_taxes,
        payment.project_id
      );

      // Return created payment
      return {
        payment: {
          id: paymentResult.lastInsertRowid,
          ...payment
        },
        project_status: newProjectStatus
      };
    })();

    // Invalidate caches
    cache.invalidate('payments:with-projects');
    cache.invalidate('projects:all');
    cache.invalidate('projects:with-scope');

    res.json(result);
  } catch (error) {
    console.error('Transaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete payment
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    paymentQueries.delete.run(id);

    // Invalidate cache
    cache.invalidate('payments:with-projects');

    res.json({ success: true, message: 'Payment deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
