/**
 * Payments API - Get all payments with project names
 * Converted from Express route: GET /api/payments/with-projects
 * Used by accounting.html
 */

export async function onRequestGet(context) {
  try {
    const { env } = context;

    const result = await env.DB.prepare(`
      SELECT
        p.id,
        p.invoice_id,
        p.project_id,
        p.amount,
        p.payment_date,
        p.payment_method,
        p.payment_type,
        p.notes,
        pr.name as project_name
      FROM payments p
      LEFT JOIN projects pr ON pr.id = p.project_id
      ORDER BY p.payment_date DESC
    `).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/payments/with-projects error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
