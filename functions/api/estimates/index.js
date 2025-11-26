/**
 * Estimates API - Cloudflare Pages Function
 * Converted from Express route: server/routes/estimates.js
 *
 * Endpoints:
 * - GET /api/estimates - Get all estimates
 * - POST /api/estimates - Create new estimate
 */

// GET /api/estimates - Get all estimates
export async function onRequestGet(context) {
  try {
    const { env } = context;

    const result = await env.DB.prepare(`
      SELECT * FROM estimates
      ORDER BY created_at DESC
    `).all();

    return Response.json(result.results);
  } catch (error) {
    console.error('GET /api/estimates error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/estimates - Create new estimate
export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();

    const {
      project_id,
      runtime,
      music_minutes = 0,
      dialogue_hours = 0,
      sound_design_hours = 0,
      mix_hours = 0,
      revision_hours = 0,
      post_days = 0,
      bundle_discount = 0,
      music_cost = 0,
      post_cost = 0,
      discount_amount = 0,
      total_cost = 0
    } = body;

    // Validation
    if (!project_id) {
      return Response.json(
        { error: 'project_id required' },
        { status: 400 }
      );
    }

    // Insert into D1
    const result = await env.DB.prepare(`
      INSERT INTO estimates (
        project_id, runtime, music_minutes, dialogue_hours,
        sound_design_hours, mix_hours, revision_hours, post_days,
        bundle_discount, music_cost, post_cost, discount_amount, total_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      project_id,
      runtime || null,
      music_minutes,
      dialogue_hours,
      sound_design_hours,
      mix_hours,
      revision_hours,
      post_days,
      bundle_discount ? 1 : 0,  // Convert boolean to integer
      music_cost,
      post_cost,
      discount_amount,
      total_cost
    ).run();

    if (!result.success) {
      throw new Error('Failed to create estimate');
    }

    // Return created estimate
    return Response.json({
      id: result.meta.last_row_id,
      project_id,
      ...body
    });

  } catch (error) {
    console.error('POST /api/estimates error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
}
