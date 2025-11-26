/**
 * Hours Log API - Update and delete hours log entry
 * Converted from Express route: server/routes/hours-log.js
 *
 * Endpoints:
 * - PATCH /api/hours-log/:id - Update hours log entry
 * - DELETE /api/hours-log/:id - Delete hours log entry
 */

// PATCH /api/hours-log/:id - Update hours log entry
export async function onRequestPatch(context) {
  try {
    const { env, request, params } = context;
    const id = parseInt(params.id);
    const body = await request.json();

    // Fetch existing entry
    const entry = await env.DB.prepare(`
      SELECT * FROM hours_log WHERE id = ?
    `).bind(id).first();

    if (!entry) {
      return Response.json(
        { error: 'Hours log entry not found' },
        { status: 404 }
      );
    }

    // Merge updates
    const updates = { ...entry, ...body };

    // Update entry
    await env.DB.prepare(`
      UPDATE hours_log
      SET date = ?, hours = ?, category = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      updates.date,
      updates.hours,
      updates.category,
      updates.description,
      id
    ).run();

    return Response.json({ ...entry, ...body });

  } catch (error) {
    console.error('PATCH /api/hours-log/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/hours-log/:id - Delete hours log entry
export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const id = parseInt(params.id);

    await env.DB.prepare(`
      DELETE FROM hours_log WHERE id = ?
    `).bind(id).run();

    return Response.json({
      success: true,
      message: 'Hours log entry deleted'
    });

  } catch (error) {
    console.error('DELETE /api/hours-log/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
