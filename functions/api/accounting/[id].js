/**
 * Accounting API - Delete accounting record
 * Converted from Express route: DELETE /api/accounting/:id
 */

export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    await env.DB.prepare(`
      DELETE FROM accounting_records WHERE id = ?
    `).bind(id).run();

    return Response.json({
      success: true,
      message: 'Accounting record deleted'
    });
  } catch (error) {
    console.error('DELETE /api/accounting/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
