/**
 * Projects API - Cloudflare Pages Function
 * Converted from Express route: server/routes/projects.js
 *
 * Endpoints:
 * - GET /api/projects - Get all projects with stats
 * - POST /api/projects - Create new project
 */

// GET /api/projects - Get all projects with stats
export async function onRequestGet(context) {
  try {
    const { env } = context;

    const result = await env.DB.prepare(`
      SELECT
        p.*,
        COUNT(f.id) as file_count,
        COALESCE(SUM(f.file_size), 0) as total_size
      FROM projects p
      LEFT JOIN files f ON p.id = f.project_id
      WHERE (p.archived IS NULL OR p.archived = 0)
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/projects error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/projects - Create new project
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();

    const {
      name,
      password,
      password_plaintext,
      client_name,
      contact_email,
      status = 'active',
      notes,
      pinned = 0,
      media_folder_path,
      password_protected = 0,
      trt,
      music_coverage,
      timeline_start,
      timeline_end,
      estimated_total,
      estimated_taxes,
      net_after_taxes
    } = body;

    // Validation
    if (!name) {
      return Response.json(
        { error: 'Project name required' },
        { status: 400 }
      );
    }

    // Check if project with same name exists
    const existing = await env.DB.prepare(`
      SELECT * FROM projects WHERE name = ?
    `).bind(name).first();

    if (existing) {
      return Response.json(
        { error: 'Project with this name already exists' },
        { status: 400 }
      );
    }

    // Insert project
    const result = await env.DB.prepare(`
      INSERT INTO projects (
        name, password, password_plaintext, client_name, contact_email, status, notes, pinned,
        media_folder_path, password_protected, trt, music_coverage,
        timeline_start, timeline_end, estimated_total, estimated_taxes, net_after_taxes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      name,
      password || null,
      password_plaintext || null,
      client_name || null,
      contact_email || null,
      status,
      notes || null,
      pinned ? 1 : 0,
      media_folder_path || null,
      password_protected ? 1 : 0,
      trt || null,
      music_coverage || null,
      timeline_start || null,
      timeline_end || null,
      estimated_total || null,
      estimated_taxes || null,
      net_after_taxes || null
    ).run();

    if (!result.success) {
      throw new Error('Failed to create project');
    }

    return Response.json({
      id: result.meta.last_row_id,
      ...body
    }, { status: 201 });

  } catch (error) {
    console.error('POST /api/projects error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
}
