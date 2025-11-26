/**
 * Invoices API - Cloudflare Pages Function
 * Converted from Express route: server/routes/invoices.js
 *
 * Endpoints:
 * - GET /api/invoices - Get all invoices
 * - POST /api/invoices - Create new invoice
 */

// GET /api/invoices - Get all invoices
export async function onRequestGet(context) {
  try {
    const { env } = context;

    const result = await env.DB.prepare(`
      SELECT * FROM invoices
      ORDER BY created_at DESC
    `).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/invoices error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/invoices - Create new invoice
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();

    const {
      project_id,
      invoice_number,
      amount = 0,
      deposit_amount = 0,
      deposit_percentage = 0,
      final_amount = 0,
      status = 'draft',
      due_date,
      issue_date,
      line_items = []
    } = body;

    // Validation
    if (!project_id) {
      return Response.json(
        { error: 'project_id required' },
        { status: 400 }
      );
    }

    const lineItemsJson = typeof line_items === 'string'
      ? line_items
      : JSON.stringify(line_items);

    // Insert into D1
    const result = await env.DB.prepare(`
      INSERT INTO invoices (
        project_id, invoice_number, amount, deposit_amount,
        deposit_percentage, final_amount, status, due_date,
        issue_date, line_items
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      project_id,
      invoice_number || null,
      amount,
      deposit_amount,
      deposit_percentage,
      final_amount,
      status,
      due_date || null,
      issue_date || null,
      lineItemsJson
    ).run();

    if (!result.success) {
      throw new Error('Failed to create invoice');
    }

    // Return created invoice
    return Response.json({
      id: result.meta.last_row_id,
      project_id,
      ...body
    });

  } catch (error) {
    console.error('POST /api/invoices error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
}
