/**
 * Accounting API - Get accounting records by project
 * Converted from Express route: GET /api/accounting/project/:projectId
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const projectId = parseInt(params.projectId);

    const result = await env.DB.prepare(`
      SELECT * FROM accounting_records
      WHERE project_id = ?
      ORDER BY transaction_date DESC
    `).bind(projectId).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/accounting/project/:projectId error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
