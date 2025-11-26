/**
 * Hours Log API - Get total hours by category for a project
 * Converted from Express route: GET /api/hours-log/project/:projectId/totals
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const projectId = parseInt(params.projectId);

    // Get totals by category
    const totalsResult = await env.DB.prepare(`
      SELECT
        category,
        SUM(hours) as total_hours
      FROM hours_log
      WHERE project_id = ?
      GROUP BY category
    `).bind(projectId).all();

    // Get grand total
    const grandTotalResult = await env.DB.prepare(`
      SELECT SUM(hours) as total_hours
      FROM hours_log
      WHERE project_id = ?
    `).bind(projectId).first();

    return Response.json({
      by_category: totalsResult.results,
      total_hours: grandTotalResult?.total_hours || 0
    });

  } catch (error) {
    console.error('GET /api/hours-log/project/:projectId/totals error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
