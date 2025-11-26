/**
 * Estimates API - Get estimates for a specific project
 * Converted from Express route: GET /api/estimates/project/:projectId
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const projectId = parseInt(params.projectId);

    const result = await env.DB.prepare(`
      SELECT * FROM estimates
      WHERE project_id = ?
      ORDER BY created_at DESC
    `).bind(projectId).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/estimates/project/:projectId error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
