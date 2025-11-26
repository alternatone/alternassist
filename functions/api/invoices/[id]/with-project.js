/**
 * Invoices API - Get single invoice with project info
 * Converted from Express route: GET /api/invoices/:id/with-project
 * Optimized - single query with JOIN and JSON_GROUP_ARRAY for payments
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    const data = await env.DB.prepare(`
      SELECT
        i.*,
        p.name as project_name,
        p.client_name,
        COALESCE(
          JSON_GROUP_ARRAY(
            CASE WHEN pm.id IS NOT NULL THEN
              JSON_OBJECT(
                'id', pm.id,
                'amount', pm.amount,
                'payment_date', pm.payment_date,
                'payment_method', pm.payment_method,
                'payment_type', pm.payment_type,
                'notes', pm.notes
              )
            END
          ) FILTER (WHERE pm.id IS NOT NULL),
          '[]'
        ) as payments_json
      FROM invoices i
      LEFT JOIN projects p ON p.id = i.project_id
      LEFT JOIN payments pm ON pm.invoice_id = i.id
      WHERE i.id = ?
      GROUP BY i.id
    `).bind(id).first();

    if (!data) {
      return Response.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Parse JSON aggregated payments
    const { payments_json, ...invoice } = data;
    return Response.json({
      ...invoice,
      payments: JSON.parse(payments_json || '[]')
    });

  } catch (error) {
    console.error('GET /api/invoices/:id/with-project error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
