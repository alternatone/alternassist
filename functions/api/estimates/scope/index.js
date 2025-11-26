/**
 * Estimates API - Create or update project scope
 * Converted from Express route: POST /api/estimates/scope
 */

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();

    const {
      project_id,
      contact_email,
      music_minutes,
      dialogue_hours,
      sound_design_hours,
      mix_hours,
      revision_hours
    } = body;

    // Validation
    if (!project_id) {
      return Response.json(
        { error: 'project_id is required' },
        { status: 400 }
      );
    }

    // Upsert scope data (INSERT or UPDATE if exists)
    await env.DB.prepare(`
      INSERT INTO project_scope (
        project_id, contact_email, music_minutes, dialogue_hours,
        sound_design_hours, mix_hours, revision_hours
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        contact_email = excluded.contact_email,
        music_minutes = excluded.music_minutes,
        dialogue_hours = excluded.dialogue_hours,
        sound_design_hours = excluded.sound_design_hours,
        mix_hours = excluded.mix_hours,
        revision_hours = excluded.revision_hours,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      project_id,
      contact_email || null,
      music_minutes || 0,
      dialogue_hours || 0,
      sound_design_hours || 0,
      mix_hours || 0,
      revision_hours || 0
    ).run();

    // Fetch and return the updated scope
    const scope = await env.DB.prepare(`
      SELECT * FROM project_scope WHERE project_id = ?
    `).bind(project_id).first();

    return Response.json(scope);

  } catch (error) {
    console.error('POST /api/estimates/scope error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
}
