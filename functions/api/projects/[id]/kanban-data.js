/**
 * Projects API - Get kanban board data for a project
 * Converted from Express route: GET /api/projects/:id/kanban-data
 * Returns comprehensive project data with cues stats and hours logged
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    const data = await env.DB.prepare(`
      SELECT
        p.id,
        p.name,
        p.client_name,
        p.status,
        p.notes,
        p.status_text,
        p.pinned,
        ps.contact_email,
        ps.music_minutes,
        ps.dialogue_hours,
        ps.sound_design_hours,
        ps.mix_hours,
        ps.revision_hours,
        (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND status = 'to-write') as cues_to_write,
        (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND status = 'written') as cues_written,
        (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND status = 'revisions') as cues_revisions,
        (SELECT COUNT(*) FROM cues WHERE project_id = p.id AND (status = 'approved' OR status = 'complete')) as cues_approved,
        (SELECT COALESCE(SUM(hours), 0) FROM hours_log WHERE project_id = p.id AND category = 'dialogue') as logged_dialogue,
        (SELECT COALESCE(SUM(hours), 0) FROM hours_log WHERE project_id = p.id AND category = 'sound-design') as logged_sound_design,
        (SELECT COALESCE(SUM(hours), 0) FROM hours_log WHERE project_id = p.id AND category = 'mix') as logged_mix,
        (SELECT COALESCE(SUM(hours), 0) FROM hours_log WHERE project_id = p.id AND category = 'revisions') as logged_revisions
      FROM projects p
      LEFT JOIN project_scope ps ON ps.project_id = p.id
      WHERE p.id = ?
    `).bind(id).first();

    if (!data) {
      return Response.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return Response.json(data);

  } catch (error) {
    console.error('GET /api/projects/:id/kanban-data error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
