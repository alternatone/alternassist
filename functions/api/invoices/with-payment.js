/**
 * Invoices API - Create invoice with payment
 * Converted from Express route: POST /api/invoices/with-payment
 * Unified transaction endpoint for creating invoice, payment, and updating project
 */

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const body = await request.json();
    const { invoice, payment, updateProject } = body;

    // Validation
    if (!invoice || !payment) {
      return Response.json(
        { error: 'Invoice and payment data required' },
        { status: 400 }
      );
    }

    // Prepare line items JSON
    const lineItemsJson = typeof invoice.line_items === 'string'
      ? invoice.line_items
      : JSON.stringify(invoice.line_items);

    // Build transaction statements
    const statements = [
      // 1. Create invoice
      env.DB.prepare(`
        INSERT INTO invoices (
          project_id, invoice_number, amount, deposit_amount,
          deposit_percentage, final_amount, status, due_date,
          issue_date, line_items
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        invoice.project_id,
        invoice.invoice_number || null,
        invoice.amount || 0,
        invoice.deposit_amount || 0,
        invoice.deposit_percentage || 0,
        invoice.final_amount || 0,
        invoice.status || 'sent',
        invoice.due_date || null,
        invoice.issue_date || null,
        lineItemsJson
      )
    ];

    // Execute transaction using D1 batch
    const results = await env.DB.batch(statements);
    const invoiceId = results[0].meta.last_row_id;

    // 2. Create payment record (separate statement after getting invoice ID)
    await env.DB.prepare(`
      INSERT INTO payments (
        invoice_id, project_id, amount, payment_date,
        payment_method, payment_type, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      invoiceId,
      payment.project_id,
      payment.amount,
      payment.payment_date || null,
      payment.payment_method || null,
      payment.payment_type || 'final',
      payment.notes || ''
    ).run();

    // 3. Update project status if requested
    if (updateProject && updateProject.project_id && updateProject.status) {
      await env.DB.prepare(`
        UPDATE projects
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(updateProject.status, updateProject.project_id).run();
    }

    return Response.json({
      success: true,
      invoice_id: invoiceId,
      message: 'Invoice and payment created successfully'
    });

  } catch (error) {
    console.error('POST /api/invoices/with-payment error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
}
