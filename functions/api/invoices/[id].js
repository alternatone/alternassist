/**
 * Invoices API - Get, update, and delete single invoice
 * Converted from Express route: server/routes/invoices.js
 *
 * Endpoints:
 * - GET /api/invoices/:id - Get single invoice with payments
 * - PATCH /api/invoices/:id - Update invoice
 * - DELETE /api/invoices/:id - Delete invoice
 */

// GET /api/invoices/:id - Get single invoice with payments
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    const data = await env.DB.prepare(`
      SELECT i.*,
        COALESCE(
          JSON_GROUP_ARRAY(
            CASE WHEN p.id IS NOT NULL THEN
              JSON_OBJECT(
                'id', p.id,
                'amount', p.amount,
                'payment_date', p.payment_date,
                'payment_method', p.payment_method,
                'payment_type', p.payment_type,
                'notes', p.notes,
                'created_at', p.created_at
              )
            END
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) as payments_json
      FROM invoices i
      LEFT JOIN payments p ON p.invoice_id = i.id
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
    console.error('GET /api/invoices/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/invoices/:id - Update invoice
export async function onRequestPatch(context) {
  try {
    const { env, request, params } = context;
    const id = parseInt(params.id);
    const body = await request.json();

    // Fetch existing invoice
    const invoice = await env.DB.prepare(`
      SELECT * FROM invoices WHERE id = ?
    `).bind(id).first();

    if (!invoice) {
      return Response.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Merge updates
    const updates = { ...invoice, ...body };
    updates.line_items = typeof updates.line_items === 'string'
      ? updates.line_items
      : JSON.stringify(updates.line_items);

    // Update invoice
    await env.DB.prepare(`
      UPDATE invoices
      SET invoice_number = ?, amount = ?, deposit_amount = ?,
          deposit_percentage = ?, final_amount = ?, status = ?,
          due_date = ?, issue_date = ?, line_items = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      updates.invoice_number,
      updates.amount,
      updates.deposit_amount,
      updates.deposit_percentage,
      updates.final_amount,
      updates.status,
      updates.due_date,
      updates.issue_date,
      updates.line_items,
      id
    ).run();

    return Response.json({ ...invoice, ...body, id });

  } catch (error) {
    console.error('PATCH /api/invoices/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/invoices/:id - Delete invoice
export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    await env.DB.prepare(`
      DELETE FROM invoices WHERE id = ?
    `).bind(id).run();

    return Response.json({
      success: true,
      message: 'Invoice deleted'
    });

  } catch (error) {
    console.error('DELETE /api/invoices/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
