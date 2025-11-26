/**
 * Invoices API - Get invoices for a specific project
 * Converted from Express route: GET /api/invoices/project/:projectId
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const projectId = parseInt(params.projectId);

    const result = await env.DB.prepare(`
      SELECT * FROM invoices
      WHERE project_id = ?
      ORDER BY created_at DESC
    `).bind(projectId).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/invoices/project/:projectId error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
