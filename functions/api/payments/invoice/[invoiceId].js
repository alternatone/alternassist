/**
 * Payments API - Get payments for a specific invoice
 * Converted from Express route: GET /api/payments/invoice/:invoiceId
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const invoiceId = parseInt(params.invoiceId);

    const result = await env.DB.prepare(`
      SELECT * FROM payments
      WHERE invoice_id = ?
      ORDER BY payment_date DESC
    `).bind(invoiceId).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/payments/invoice/:invoiceId error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
