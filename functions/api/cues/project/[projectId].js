/**
 * Cues by Project API - Cloudflare Pages Function
 *
 * Endpoint: GET /api/cues/project/:projectId
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const projectId = parseInt(params.projectId);

    if (!projectId || isNaN(projectId)) {
      return Response.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    // Query D1 database
    const result = await env.DB.prepare(`
      SELECT * FROM cues
      WHERE project_id = ?
      ORDER BY cue_number ASC
    `).bind(projectId).all();

    return Response.json(result.results || []);
  } catch (error) {
    console.error('GET /api/cues/project/:projectId error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
