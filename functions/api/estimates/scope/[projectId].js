/**
 * Estimates API - Get or create project scope
 * Converted from Express route: GET /api/estimates/scope/:projectId
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const projectId = parseInt(params.projectId);

    const scope = await env.DB.prepare(`
      SELECT * FROM project_scope WHERE project_id = ?
    `).bind(projectId).first();

    // If no scope exists, return default structure
    if (!scope) {
      return Response.json({
        project_id: projectId,
        contact_email: '',
        music_minutes: 0,
        dialogue_hours: 0,
        sound_design_hours: 0,
        mix_hours: 0,
        revision_hours: 0
      });
    }

    return Response.json(scope);
  } catch (error) {
    console.error('GET /api/estimates/scope/:projectId error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
