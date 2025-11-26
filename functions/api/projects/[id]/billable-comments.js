/**
 * Projects API - Get billable comments for a project
 * Converted from Express route: GET /api/projects/:id/billable-comments
 * PHASE 3: Returns comments marked as billable
 * NOTE: Requires admin authentication in production
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const projectId = parseInt(params.id);

    const result = await env.DB.prepare(`
      SELECT
        c.*,
        f.original_name as file_name,
        i.invoice_number
      FROM comments c
      JOIN files f ON f.id = c.file_id
      LEFT JOIN invoices i ON i.id = c.invoice_id
      WHERE f.project_id = ? AND c.billable = 1
      ORDER BY c.created_at DESC
    `).bind(projectId).all();

    return Response.json(result.results);

  } catch (error) {
    console.error('GET /api/projects/:id/billable-comments error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
