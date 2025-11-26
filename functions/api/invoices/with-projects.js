/**
 * Invoices API - Get all invoices with project info
 * Converted from Express route: GET /api/invoices/with-projects
 * Optimized - single query with JOIN
 */

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit')) || 50;

    const result = await env.DB.prepare(`
      SELECT
        i.*,
        p.name as project_name,
        p.client_name
      FROM invoices i
      LEFT JOIN projects p ON p.id = i.project_id
      ORDER BY i.created_at DESC
      LIMIT ?
    `).bind(limit).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/invoices/with-projects error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
