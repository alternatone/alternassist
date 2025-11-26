/**
 * Payments API - Get payments for a specific project
 * Converted from Express route: GET /api/payments/project/:projectId
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const projectId = parseInt(params.projectId);

    const result = await env.DB.prepare(`
      SELECT * FROM payments
      WHERE project_id = ?
      ORDER BY payment_date DESC
    `).bind(projectId).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/payments/project/:projectId error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
