/**
 * Payments API - Delete payment
 * Converted from Express route: DELETE /api/payments/:id
 */

export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    await env.DB.prepare(`
      DELETE FROM payments WHERE id = ?
    `).bind(id).run();

    return Response.json({
      success: true,
      message: 'Payment deleted'
    });
  } catch (error) {
    console.error('DELETE /api/payments/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
