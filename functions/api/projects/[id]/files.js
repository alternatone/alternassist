/**
 * Projects API - Get files for a project
 * Converted from Express route: GET /api/projects/:id/files
 */

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const projectId = parseInt(params.id);

    const result = await env.DB.prepare(`
      SELECT * FROM files
      WHERE project_id = ?
      ORDER BY created_at DESC
    `).bind(projectId).all();

    // Add type field based on mime_type
    const files = result.results.map(f => {
      let type = 'document';
      if (f.mime_type.startsWith('video/')) type = 'video';
      else if (f.mime_type.startsWith('audio/')) type = 'audio';
      else if (f.mime_type.startsWith('image/')) type = 'image';

      return { ...f, type };
    });

    return Response.json(files);

  } catch (error) {
    console.error('GET /api/projects/:id/files error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
