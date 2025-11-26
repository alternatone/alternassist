/**
 * Invoices API - Remove deliverable link
 * Converted from Express route: DELETE /api/invoices/deliverables/:id
 * PHASE 3: Invoice deliverables endpoints
 *
 * NOTE: This requires admin authentication in production
 */

export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    await env.DB.prepare(`
      DELETE FROM invoice_deliverables WHERE id = ?
    `).bind(id).run();

    return Response.json({
      success: true,
      message: 'Deliverable link removed'
    });

  } catch (error) {
    console.error('DELETE /api/invoices/deliverables/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
