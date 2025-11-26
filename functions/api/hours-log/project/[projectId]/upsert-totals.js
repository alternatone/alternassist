/**
 * Hours Log API - Upsert cumulative hours by category for a project
 * Converted from Express route: POST /api/hours-log/project/:projectId/upsert-totals
 * This endpoint handles updating cumulative totals from the kanban board
 */

export async function onRequestPost(context) {
  try {
    const { env, request, params } = context;
    const projectId = parseInt(params.projectId);
    const body = await request.json();

    const { music, dialogue, soundDesign, mix, revisions } = body;

    // Verify project exists
    const project = await env.DB.prepare(`
      SELECT * FROM projects WHERE id = ?
    `).bind(projectId).first();

    if (!project) {
      return Response.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const categories = {
      'music': music,
      'dialogue': dialogue,
      'sound-design': soundDesign,
      'mix': mix,
      'revisions': revisions
    };

    // Get current totals by category
    const totalsResult = await env.DB.prepare(`
      SELECT
        category,
        SUM(hours) as total_hours
      FROM hours_log
      WHERE project_id = ?
      GROUP BY category
    `).bind(projectId).all();

    const totalMap = Object.fromEntries(
      totalsResult.results.map(t => [t.category, t.total_hours || 0])
    );

    // Calculate differences and insert adjustments
    const insertStatements = [];
    for (const [name, targetHours] of Object.entries(categories)) {
      const target = parseFloat(targetHours) || 0;
      if (target === 0) continue;

      const current = totalMap[name] || 0;
      const diff = target - current;

      if (diff !== 0) {
        insertStatements.push(
          env.DB.prepare(`
            INSERT INTO hours_log (project_id, date, hours, category, description)
            VALUES (?, ?, ?, ?, ?)
          `).bind(projectId, today, diff, name, 'Updated from kanban board')
        );
      }
    }

    // Execute all inserts in batch if there are any
    if (insertStatements.length > 0) {
      await env.DB.batch(insertStatements);
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('POST /api/hours-log/project/:projectId/upsert-totals error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
