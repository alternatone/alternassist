/**
 * Hours Log API - Get hours log entries for a specific project
 * Converted from Express route: GET /api/hours-log/project/:projectId
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const projectId = parseInt(params.projectId);

    const result = await env.DB.prepare(`
      SELECT * FROM hours_log
      WHERE project_id = ?
      ORDER BY date DESC
    `).bind(projectId).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/hours-log/project/:projectId error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
