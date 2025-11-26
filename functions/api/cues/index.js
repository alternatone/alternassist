/**
 * Cues API - Cloudflare Pages Function
 * Converted from Express route: server/routes/cues.js
 *
 * Endpoints:
 * - GET /api/cues - Get all cues
 * - POST /api/cues - Create new cue
 */

// GET /api/cues - Get all cues for a project
export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');

    if (!projectId) {
      return Response.json({ error: 'projectId query parameter required' }, { status: 400 });
    }

    // Query D1 database
    const result = await env.DB.prepare(`
      SELECT * FROM cues
      WHERE project_id = ?
      ORDER BY cue_number ASC
    `).bind(parseInt(projectId)).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/cues error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/cues - Create new cue
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();

    const {
      project_id,
      cue_number,
      title,
      status = 'to-write',
      duration,
      notes,
      start_time,
      end_time,
      theme,
      version
    } = body;

    // Validation
    if (!project_id || !cue_number) {
      return Response.json(
        { error: 'project_id and cue_number are required' },
        { status: 400 }
      );
    }

    // Insert into D1
    const result = await env.DB.prepare(`
      INSERT INTO cues (
        project_id, cue_number, title, status, duration,
        notes, start_time, end_time, theme, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      project_id,
      cue_number,
      title || null,
      status,
      duration || null,
      notes || null,
      start_time || null,
      end_time || null,
      theme || null,
      version || null
    ).run();

    if (!result.success) {
      throw new Error('Failed to create cue');
    }

    // Return created cue
    return Response.json({
      id: result.meta.last_row_id,
      project_id,
      cue_number,
      title,
      status,
      duration,
      notes,
      start_time,
      end_time,
      theme,
      version
    }, { status: 201 });

  } catch (error) {
    console.error('POST /api/cues error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
