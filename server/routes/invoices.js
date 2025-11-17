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

// Get single invoice by ID
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const invoice = invoiceQueries.findById.get(id);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Get payments for this invoice
    const payments = paymentQueries.findByInvoice.all(id);

    res.json({
      ...invoice,
      payments
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new invoice
router.post('/', (req, res) => {
  try {
    const {
      project_id,
      invoice_number,
      amount,
      deposit_amount,
      deposit_percentage,
      final_amount,
      status,
      due_date,
      issue_date,
      line_items
    } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Verify project exists
    const project = projectQueries.findById.get(project_id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = invoiceQueries.create.run(
      project_id,
      invoice_number || null,
      amount || 0,
      deposit_amount || 0,
      deposit_percentage || 0,
      final_amount || 0,
      status || 'draft',
      due_date || null,
      issue_date || null,
      typeof line_items === 'string' ? line_items : JSON.stringify(line_items || [])
    );

    const invoice = invoiceQueries.findById.get(result.lastInsertRowid);
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update invoice
router.patch('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      invoice_number,
      amount,
      deposit_amount,
      deposit_percentage,
      final_amount,
      status,
      due_date,
      issue_date,
      line_items
    } = req.body;

    const invoice = invoiceQueries.findById.get(id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    invoiceQueries.update.run(
      invoice_number !== undefined ? invoice_number : invoice.invoice_number,
      amount !== undefined ? amount : invoice.amount,
      deposit_amount !== undefined ? deposit_amount : invoice.deposit_amount,
      deposit_percentage !== undefined ? deposit_percentage : invoice.deposit_percentage,
      final_amount !== undefined ? final_amount : invoice.final_amount,
      status !== undefined ? status : invoice.status,
      due_date !== undefined ? due_date : invoice.due_date,
      issue_date !== undefined ? issue_date : invoice.issue_date,
      line_items !== undefined ? (typeof line_items === 'string' ? line_items : JSON.stringify(line_items)) : invoice.line_items,
      id
    );

    const updatedInvoice = invoiceQueries.findById.get(id);
    res.json(updatedInvoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete invoice
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Check for related payments
    const payments = paymentQueries.findByInvoice.all(id);

    if (payments.length > 0 && !req.query.confirm) {
      const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
      return res.status(409).json({
        error: 'Invoice has payments',
        warning: true,
        paymentCount: payments.length,
        message: `This invoice has ${payments.length} payment(s) totaling $${totalAmount.toFixed(2)}. Add ?confirm=true to proceed.`
      });
    }

    invoiceQueries.delete.run(id);
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
