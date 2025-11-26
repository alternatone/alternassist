/**
 * Projects API - Archive project
 * Converted from Express route: POST /api/projects/:id/archive
 * PHASE 3: Soft delete functionality
 */

export async function onRequestPost(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    // Check if project exists
    const project = await env.DB.prepare(`
      SELECT * FROM projects WHERE id = ?
    `).bind(id).first();

    if (!project) {
      return Response.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Archive project
    await env.DB.prepare(`
      UPDATE projects
      SET archived = 1, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(id).run();

    return Response.json({
      success: true,
      message: 'Project archived'
    });

  } catch (error) {
    console.error('POST /api/projects/:id/archive error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
