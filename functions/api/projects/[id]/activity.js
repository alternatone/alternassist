/**
 * Projects API - Get activity log for a project
 * Converted from Express route: GET /api/projects/:id/activity
 * PHASE 2: Activity tracking endpoint
 * NOTE: Requires admin authentication in production
 */

export async function onRequestGet(context) {
  try {
    const { env, request, params } = context;
    const projectId = parseInt(params.id);
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit')) || 100;

    const result = await env.DB.prepare(`
      SELECT * FROM access_logs
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(projectId, limit).all();

    return Response.json(result.results);

  } catch (error) {
    console.error('GET /api/projects/:id/activity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
