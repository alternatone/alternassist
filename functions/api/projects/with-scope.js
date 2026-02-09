/**
 * Projects API - Get projects with scope data
 * Converted from Express route: GET /api/projects/with-scope
 * Returns projects with project_scope JOIN for kanban board
 */

export async function onRequestGet(context) {
  try {
    const { env } = context;

    const result = await env.DB.prepare(`
      SELECT
        p.id,
        p.name,
        p.client_name,
        p.status,
        p.notes,
        p.status_text,
        p.pinned,
        p.music_coverage,
        p.updated_at,
        ps.contact_email,
        ps.music_minutes,
        ps.dialogue_hours,
        ps.sound_design_hours,
        ps.mix_hours,
        ps.revision_hours
      FROM projects p
      LEFT JOIN project_scope ps ON ps.project_id = p.id
      WHERE (p.archived IS NULL OR p.archived = 0)
      ORDER BY p.updated_at DESC
    `).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/projects/with-scope error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
