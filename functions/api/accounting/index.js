/**
 * Accounting API - Cloudflare Pages Function
 * Converted from Express route: server/routes/accounting.js
 *
 * Endpoints:
 * - GET /api/accounting - Get all accounting records
 * - POST /api/accounting - Create new accounting record
 */

// GET /api/accounting - Get all accounting records
export async function onRequestGet(context) {
  try {
    const { env } = context;

    const result = await env.DB.prepare(`
      SELECT * FROM accounting_records
      ORDER BY transaction_date DESC
    `).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/accounting error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/accounting - Create new accounting record
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();

    const {
      project_id,
      transaction_type,
      category,
      amount,
      transaction_date,
      description
    } = body;

    // Validation
    if (!transaction_type || !amount) {
      return Response.json(
        { error: 'transaction_type and amount required' },
        { status: 400 }
      );
    }

    // Insert into D1
    const result = await env.DB.prepare(`
      INSERT INTO accounting_records (
        project_id, transaction_type, category, amount,
        transaction_date, description
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      project_id || null,
      transaction_type,
      category || null,
      amount,
      transaction_date || null,
      description || null
    ).run();

    if (!result.success) {
      throw new Error('Failed to create accounting record');
    }

    // Return created record
    return Response.json({
      id: result.meta.last_row_id,
      ...body
    });

  } catch (error) {
    console.error('POST /api/accounting error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
