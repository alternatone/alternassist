/**
 * Projects API - Get unbilled files for a project
 * Converted from Express route: GET /api/projects/:id/unbilled-files
 * PHASE 3: Returns files not linked to any invoice
 * NOTE: Requires admin authentication in production
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const projectId = parseInt(params.id);

    const result = await env.DB.prepare(`
      SELECT f.*
      FROM files f
      WHERE f.project_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM invoice_deliverables d
          WHERE d.file_id = f.id
        )
      ORDER BY f.created_at DESC
    `).bind(projectId).all();

    return Response.json(result.results);

  } catch (error) {
    console.error('GET /api/projects/:id/unbilled-files error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
