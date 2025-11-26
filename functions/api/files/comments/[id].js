/**
 * Files API - Comment operations
 * Converted from Express route: server/routes/files.js
 *
 * Endpoints:
 * - PATCH /api/files/comments/:id - Update comment status
 * - DELETE /api/files/comments/:id - Delete comment
 *
 * NOTE: Authentication middleware will need to be implemented for production
 */

// PATCH /api/files/comments/:id - Update comment status
export async function onRequestPatch(context) {
  try {
    const { env, request, params } = context;
    const commentId = parseInt(params.id);
    const body = await request.json();
    const { status, billable, estimated_hours, invoiceId } = body;

    // Handle regular status update
    if (status && ['open', 'resolved'].includes(status)) {
      // Check if comment exists
      const comment = await env.DB.prepare(`
        SELECT * FROM comments WHERE id = ?
      `).bind(commentId).first();

      if (!comment) {
        return Response.json(
          { error: 'Comment not found' },
          { status: 404 }
        );
      }

      // Update status
      await env.DB.prepare(`
        UPDATE comments
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(status, commentId).run();

      return Response.json({ success: true, id: commentId, status });
    }

    // Handle billable status update (Phase 3)
    if (billable !== undefined) {
      const comment = await env.DB.prepare(`
        SELECT * FROM comments WHERE id = ?
      `).bind(commentId).first();

      if (!comment) {
        return Response.json(
          { error: 'Comment not found' },
          { status: 404 }
        );
      }

      await env.DB.prepare(`
        UPDATE comments
        SET billable = ?, estimated_hours = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        billable ? 1 : 0,
        estimated_hours || null,
        commentId
      ).run();

      return Response.json({ success: true, id: commentId, billable, estimated_hours });
    }

    // Handle invoice linking (Phase 3)
    if (invoiceId !== undefined) {
      const comment = await env.DB.prepare(`
        SELECT * FROM comments WHERE id = ?
      `).bind(commentId).first();

      if (!comment) {
        return Response.json(
          { error: 'Comment not found' },
          { status: 404 }
        );
      }

      await env.DB.prepare(`
        UPDATE comments
        SET invoice_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(invoiceId || null, commentId).run();

      return Response.json({ success: true, id: commentId, invoiceId });
    }

    return Response.json(
      { error: 'Invalid request. Provide status, billable, or invoiceId' },
      { status: 400 }
    );

  } catch (error) {
    console.error('PATCH /api/files/comments/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/files/comments/:id - Delete comment
export async function onRequestDelete(context) {
  try {
    const { env, params } = context;
    const commentId = parseInt(params.id);

    // Check if comment exists
    const comment = await env.DB.prepare(`
      SELECT * FROM comments WHERE id = ?
    `).bind(commentId).first();

    if (!comment) {
      return Response.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Delete comment
    await env.DB.prepare(`
      DELETE FROM comments WHERE id = ?
    `).bind(commentId).run();

    return Response.json({ success: true, id: commentId });

  } catch (error) {
    console.error('DELETE /api/files/comments/:id error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
