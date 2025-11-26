/**
 * Projects API - Unarchive project
 * Converted from Express route: POST /api/projects/:id/unarchive
 * PHASE 3: Restore archived project
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

    // Unarchive project
    await env.DB.prepare(`
      UPDATE projects
      SET archived = 0, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(id).run();

    return Response.json({
      success: true,
      message: 'Project unarchived'
    });

  } catch (error) {
    console.error('POST /api/projects/:id/unarchive error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
