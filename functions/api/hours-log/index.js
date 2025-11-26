/**
 * Hours Log API - Cloudflare Pages Function
 * Converted from Express route: server/routes/hours-log.js
 *
 * Endpoints:
 * - GET /api/hours-log - Get all hours log entries
 * - POST /api/hours-log - Create new hours log entry
 */

// GET /api/hours-log - Get all hours log entries
export async function onRequestGet(context) {
  try {
    const { env } = context;

    const result = await env.DB.prepare(`
      SELECT * FROM hours_log
      ORDER BY date DESC
    `).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/hours-log error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/hours-log - Create new hours log entry
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();

    const {
      project_id,
      date,
      hours,
      category,
      description
    } = body;

    // Validation
    if (!project_id || !date || hours === undefined) {
      return Response.json(
        { error: 'project_id, date, hours required' },
        { status: 400 }
      );
    }

    // Insert into D1
    const result = await env.DB.prepare(`
      INSERT INTO hours_log (
        project_id, date, hours, category, description
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      project_id,
      date,
      hours,
      category || null,
      description || null
    ).run();

    if (!result.success) {
      throw new Error('Failed to create hours log entry');
    }

    // Return created entry
    return Response.json({
      id: result.meta.last_row_id,
      ...body
    });

  } catch (error) {
    console.error('POST /api/hours-log error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
}
