/**
 * Projects API - Get archived projects
 * Converted from Express route: GET /api/projects/archived
 * PHASE 3: Returns list of archived projects
 */

export async function onRequestGet(context) {
  try {
    const { env } = context;

    const result = await env.DB.prepare(`
      SELECT * FROM projects
      WHERE archived = 1
      ORDER BY archived_at DESC
    `).all();

    return Response.json(result.results);

  } catch (error) {
    console.error('GET /api/projects/archived error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
