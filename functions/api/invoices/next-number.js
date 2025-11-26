/**
 * Invoices API - Get next invoice number
 * Converted from Express route: GET /api/invoices/next-number
 * Optimized - database MAX() query
 */

export async function onRequestGet(context) {
  try {
    const { env } = context;

    const result = await env.DB.prepare(`
      SELECT MAX(CAST(SUBSTR(invoice_number, 3) AS INTEGER)) as max_num
      FROM invoices
      WHERE invoice_number LIKE '25%'
        AND LENGTH(invoice_number) >= 4
    `).first();

    const maxNumber = result?.max_num || 2522;
    const nextNumber = '25' + String(maxNumber + 1).padStart(2, '0');

    return Response.json({
      nextNumber,
      currentMax: maxNumber
    });

  } catch (error) {
    console.error('GET /api/invoices/next-number error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
