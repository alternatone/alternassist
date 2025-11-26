/**
 * Invoices API - Get and create deliverables for an invoice
 * Converted from Express route: server/routes/invoices.js
 * PHASE 3: Invoice deliverables endpoints
 *
 * Endpoints:
 * - GET /api/invoices/:invoiceId/deliverables - Get deliverables for an invoice
 * - POST /api/invoices/:invoiceId/deliverables - Link file to invoice as deliverable
 *
 * NOTE: This requires admin authentication in production
 */

// GET /api/invoices/:invoiceId/deliverables
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const invoiceId = parseInt(params.invoiceId);

    const result = await env.DB.prepare(`
      SELECT d.*, f.original_name, f.file_size, f.mime_type, f.folder
      FROM invoice_deliverables d
      JOIN files f ON f.id = d.file_id
      WHERE d.invoice_id = ?
      ORDER BY d.created_at DESC
    `).bind(invoiceId).all();

    return Response.json(result.results);

  } catch (error) {
    console.error('GET /api/invoices/:invoiceId/deliverables error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/invoices/:invoiceId/deliverables
// Link file to invoice as deliverable
export async function onRequestPost(context) {
  try {
    const { env, request, params } = context;
    const invoiceId = parseInt(params.invoiceId);
    const body = await request.json();
    const { fileId, description } = body;

    // Validation
    if (!fileId) {
      return Response.json(
        { error: 'fileId required' },
        { status: 400 }
      );
    }

    // Insert deliverable link
    const result = await env.DB.prepare(`
      INSERT INTO invoice_deliverables (invoice_id, file_id, description)
      VALUES (?, ?, ?)
    `).bind(
      invoiceId,
      fileId,
      description || null
    ).run();

    return Response.json({
      success: true,
      id: result.meta.last_row_id,
      invoiceId,
      fileId
    });

  } catch (error) {
    // Handle unique constraint violation (file already linked to invoice)
    if (error.message && error.message.includes('UNIQUE constraint')) {
      return Response.json(
        { error: 'File already linked to this invoice' },
        { status: 400 }
      );
    }
    console.error('POST /api/invoices/:invoiceId/deliverables error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
