/**
 * Projects API - Get projects with music scope
 * Converted from Express route: GET /api/projects/with-music
 * Returns projects that have music minutes defined
 */

export async function onRequestGet(context) {
  try {
    const { env } = context;

    const result = await env.DB.prepare(`
      SELECT
        p.id,
        p.name,
        p.client_name,
        COALESCE(p.music_coverage, ps.music_minutes, 0) as music_minutes
      FROM projects p
      LEFT JOIN project_scope ps ON ps.project_id = p.id
      WHERE (p.archived IS NULL OR p.archived = 0)
        AND COALESCE(p.music_coverage, ps.music_minutes, 0) > 0
      ORDER BY p.updated_at DESC
    `).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/projects/with-music error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
