/**
 * Payments API - Mark invoice as paid
 * Converted from Express route: POST /api/payments/mark-invoice-paid
 * Transactional endpoint for payment_dashboard.html
 */

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();
    const { invoice_id, payment } = body;

    // Validation
    if (!invoice_id || !payment) {
      return Response.json(
        { error: 'invoice_id and payment required' },
        { status: 400 }
      );
    }

    // Fetch invoice to check deposit_percentage
    const invoice = await env.DB.prepare(`
      SELECT * FROM invoices WHERE id = ?
    `).bind(invoice_id).first();

    if (!invoice) {
      return Response.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Fetch project data for update
    const project = await env.DB.prepare(`
      SELECT * FROM projects WHERE id = ?
    `).bind(payment.project_id).first();

    if (!project) {
      return Response.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Determine new project status based on deposit percentage
    const newProjectStatus = invoice.deposit_percentage === 100 ? 'completed' : 'active';

    // Execute transaction using D1 batch
    const results = await env.DB.batch([
      // 1. Update invoice status to 'paid'
      env.DB.prepare(`
        UPDATE invoices
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind('paid', invoice_id),

      // 2. Create payment record
      env.DB.prepare(`
        INSERT INTO payments (
          invoice_id, project_id, amount, payment_date,
          payment_method, payment_type, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        invoice_id,
        payment.project_id,
        payment.amount,
        payment.payment_date || null,
        payment.payment_method || null,
        payment.payment_type || payment.payment_method || null,
        payment.notes || ''
      ),

      // 3. Update project status
      env.DB.prepare(`
        UPDATE projects
        SET name = ?, client_name = ?, contact_email = ?, status = ?, notes = ?, pinned = ?,
            media_folder_path = ?, password_protected = ?, password = ?, trt = ?,
            music_coverage = ?, timeline_start = ?, timeline_end = ?,
            estimated_total = ?, estimated_taxes = ?, net_after_taxes = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        project.name,
        project.client_name,
        project.contact_email,
        newProjectStatus,
        project.notes,
        project.pinned,
        project.media_folder_path,
        project.password_protected,
        project.password,
        project.trt,
        project.music_coverage,
        project.timeline_start,
        project.timeline_end,
        project.estimated_total,
        project.estimated_taxes,
        project.net_after_taxes,
        payment.project_id
      )
    ]);

    // Get payment ID from the insert result (second statement)
    const paymentId = results[1].meta.last_row_id;

    return Response.json({
      payment: {
        id: paymentId,
        ...payment
      },
      project_status: newProjectStatus
    });

  } catch (error) {
    console.error('POST /api/payments/mark-invoice-paid error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
