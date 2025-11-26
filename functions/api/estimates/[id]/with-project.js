/**
 * Estimates API - Get single estimate with project info
 * Converted from Express route: GET /api/estimates/:id/with-project
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    const estimate = await env.DB.prepare(`
      SELECT
        e.*,
        p.name as project_name,
        p.client_name,
        p.contact_email
      FROM estimates e
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.id = ?
    `).bind(id).first();

    if (!estimate) {
      return Response.json(
        { error: 'Estimate not found' },
        { status: 404 }
      );
    }

    return Response.json(estimate);
  } catch (error) {
    console.error('GET /api/estimates/:id/with-project error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
