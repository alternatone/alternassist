/**
 * Projects API - Single project operations
 * Converted from Express route: server/routes/projects.js
 *
 * Endpoints:
 * - GET /api/projects/:id - Get single project with stats
 * - PATCH /api/projects/:id - Update project
 * - DELETE /api/projects/:id - Delete project (requires admin)
 */

// GET /api/projects/:id - Get single project with stats
export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    const project = await env.DB.prepare(`
      SELECT
        p.*,
        COALESCE(COUNT(f.id), 0) as file_count,
        COALESCE(SUM(f.file_size), 0) as total_size
      FROM projects p
      LEFT JOIN files f ON f.project_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `).bind(id).first();

    if (!project) {
      return Response.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return Response.json(project);
  } catch (error) {
    console.error('GET /api/projects/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/projects/:id - Update project
export async function onRequestPatch(context) {
  try {
    const { env, request, params } = context;
    const id = parseInt(params.id);
    const body = await request.json();

    // Fetch existing project
    const project = await env.DB.prepare(`
      SELECT * FROM projects WHERE id = ?
    `).bind(id).first();

    if (!project) {
      return Response.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Merge updates
    const updates = { ...project, ...body };

    // Update project
    await env.DB.prepare(`
      UPDATE projects
      SET name = ?, client_name = ?, contact_email = ?, status = ?, notes = ?, pinned = ?,
          media_folder_path = ?, password_protected = ?, password = ?, trt = ?,
          music_coverage = ?, timeline_start = ?, timeline_end = ?,
          estimated_total = ?, estimated_taxes = ?, net_after_taxes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      updates.name,
      updates.client_name,
      updates.contact_email,
      updates.status,
      updates.notes,
      updates.pinned ? 1 : 0,
      updates.media_folder_path,
      updates.password_protected ? 1 : 0,
      updates.password,
      updates.trt,
      updates.music_coverage,
      updates.timeline_start,
      updates.timeline_end,
      updates.estimated_total,
      updates.estimated_taxes,
      updates.net_after_taxes,
      id
    ).run();

    return Response.json({ ...project, ...body, id });

  } catch (error) {
    console.error('PATCH /api/projects/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/projects/:id - Delete project (requires admin)
export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    // NOTE: In production, this should require admin authentication
    // For now, performing hard delete as per original implementation

    await env.DB.prepare(`
      DELETE FROM projects WHERE id = ?
    `).bind(id).run();

    return Response.json({
      success: true,
      message: 'Project deleted'
    });

  } catch (error) {
    console.error('DELETE /api/projects/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
