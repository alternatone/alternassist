/**
 * Payments API - Cloudflare Pages Function
 * Converted from Express route: server/routes/payments.js
 *
 * Endpoints:
 * - GET /api/payments - Get all payments
 * - POST /api/payments - Create new payment
 */

// GET /api/payments - Get all payments
export async function onRequestGet(context) {
  try {
    const { env } = context;

    const result = await env.DB.prepare(`
      SELECT * FROM payments
      ORDER BY payment_date DESC
    `).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/payments error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/payments - Create new payment
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();

    const {
      invoice_id,
      project_id,
      amount,
      payment_date,
      payment_method,
      payment_type,
      notes
    } = body;

    // Validation
    if (!project_id || !amount) {
      return Response.json(
        { error: 'project_id and amount required' },
        { status: 400 }
      );
    }

    // Insert into D1
    const result = await env.DB.prepare(`
      INSERT INTO payments (
        invoice_id, project_id, amount, payment_date,
        payment_method, payment_type, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      invoice_id || null,
      project_id,
      amount,
      payment_date || null,
      payment_method || null,
      payment_type || null,
      notes || null
    ).run();

    if (!result.success) {
      throw new Error('Failed to create payment');
    }

    // Return created payment
    return Response.json({
      id: result.meta.last_row_id,
      ...body
    });

  } catch (error) {
    console.error('POST /api/payments error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
}
