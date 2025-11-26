/**
 * Estimates API - Delete estimate
 * Converted from Express route: DELETE /api/estimates/:id
 */

export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    await env.DB.prepare(`
      DELETE FROM estimates WHERE id = ?
    `).bind(id).run();

    return Response.json({
      success: true,
      message: 'Estimate deleted'
    });
  } catch (error) {
    console.error('DELETE /api/estimates/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
