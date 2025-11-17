# Migration Guide for Remaining Pages

This document provides step-by-step instructions for migrating the remaining localStorage-based pages to use the SQLite API.

---

## Quick Reference: Migration Pattern

All pages follow the same pattern:

### 1. Add API Helper Script
```html
<script src="api-helpers.js"></script>
```

### 2. Replace localStorage Reads
**Before:**
```javascript
const data = JSON.parse(localStorage.getItem('key') || '[]');
```

**After:**
```javascript
const data = await SomeAPI.getAll(); // or .getByProject(projectId)
```

### 3. Replace localStorage Writes
**Before:**
```javascript
localStorage.setItem('key', JSON.stringify(data));
```

**After:**
```javascript
await SomeAPI.create(dataObject);
// or
await SomeAPI.update(id, dataObject);
```

### 4. Replace localStorage Deletes
**Before:**
```javascript
data = data.filter(item => item.id !== deleteId);
localStorage.setItem('key', JSON.stringify(data));
```

**After:**
```javascript
await SomeAPI.delete(deleteId);
```

---

## Page-Specific Migrations

### 1. invoice_generator_standalone.html

**localStorage Keys Used:**
- `invoices` - Invoice records
- Possibly project/client data

**Migration Steps:**

1. **Add script:**
```html
<script src="api-helpers.js"></script>
```

2. **Replace invoice loading:**
```javascript
// OLD
const invoices = JSON.parse(localStorage.getItem('invoices') || '[]');

// NEW
const invoices = await InvoicesAPI.getAll();
```

3. **Replace invoice creation:**
```javascript
// OLD
const invoice = {
    id: Date.now(),
    project_name: projectName,
    amount: totalAmount,
    // ... other fields
};
invoices.push(invoice);
localStorage.setItem('invoices', JSON.stringify(invoices));

// NEW
const invoice = await InvoicesAPI.create({
    project_id: projectId, // Get from project selection
    invoice_number: generateInvoiceNumber(),
    amount: totalAmount,
    deposit_amount: depositAmount,
    deposit_percentage: depositPercent,
    final_amount: finalAmount,
    status: 'draft',
    due_date: dueDate,
    issue_date: issueDate,
    line_items: JSON.stringify(lineItemsArray)
});
```

4. **Replace invoice update:**
```javascript
// OLD
const index = invoices.findIndex(i => i.id === invoiceId);
invoices[index] = updatedInvoice;
localStorage.setItem('invoices', JSON.stringify(invoices));

// NEW
await InvoicesAPI.update(invoiceId, {
    amount: newAmount,
    status: 'sent', // or 'paid'
    // ... other fields to update
});
```

5. **Replace invoice delete:**
```javascript
// OLD
invoices = invoices.filter(i => i.id !== invoiceId);
localStorage.setItem('invoices', JSON.stringify(invoices));

// NEW
await InvoicesAPI.delete(invoiceId);
```

**Invoice Data Structure:**
```javascript
{
    project_id: INTEGER,           // Required - link to projects table
    invoice_number: TEXT,          // Unique invoice number
    amount: REAL,                  // Total amount
    deposit_amount: REAL,          // Deposit amount (if applicable)
    deposit_percentage: REAL,      // Deposit % (e.g., 50 for 50%)
    final_amount: REAL,            // Final/balance amount
    status: TEXT,                  // 'draft', 'sent', 'paid'
    due_date: DATE,                // When payment is due
    issue_date: DATE,              // When invoice was issued
    line_items: TEXT               // JSON string of line items array
}
```

---

### 2. payment_dashboard.html

**localStorage Keys Used:**
- Payment tracking data (specific keys depend on implementation)

**Migration Steps:**

1. **Add script:**
```html
<script src="api-helpers.js"></script>
```

2. **Replace payment loading:**
```javascript
// OLD
const payments = JSON.parse(localStorage.getItem('payments') || '[]');

// NEW
const payments = await PaymentsAPI.getAll();
// OR for specific project:
const payments = await PaymentsAPI.getByProject(projectId);
// OR for specific invoice:
const payments = await PaymentsAPI.getByInvoice(invoiceId);
```

3. **Replace payment creation:**
```javascript
// OLD
const payment = {
    id: Date.now(),
    invoice_id: invoiceId,
    amount: paymentAmount,
    date: new Date().toISOString()
};
payments.push(payment);
localStorage.setItem('payments', JSON.stringify(payments));

// NEW
const payment = await PaymentsAPI.create({
    invoice_id: invoiceId,      // Optional - can be null
    project_id: projectId,      // Required
    amount: paymentAmount,      // Required
    payment_date: paymentDate,
    payment_method: 'check',    // 'check', 'wire', 'credit_card', etc.
    payment_type: 'deposit',    // 'deposit', 'final', 'partial'
    notes: 'Payment notes'
});
```

4. **Link payments to invoices:**
```javascript
// Load invoice with all its payments
const invoice = await InvoicesAPI.getById(invoiceId);
// invoice.payments will contain all payment records
```

**Payment Data Structure:**
```javascript
{
    invoice_id: INTEGER,           // Optional - can be null for general payments
    project_id: INTEGER,           // Required - link to projects table
    amount: REAL,                  // Required - payment amount
    payment_date: DATE,            // When payment was received
    payment_method: TEXT,          // How payment was made
    payment_type: TEXT,            // Type of payment (deposit/final/partial)
    notes: TEXT                    // Additional notes
}
```

---

### 3. accounting.html

**localStorage Keys Used:**
- Accounting/transaction records

**Migration Steps:**

1. **Add script:**
```html
<script src="api-helpers.js"></script>
```

2. **Create accounting API wrapper** (needs to be added to api-helpers.js):
```javascript
const AccountingAPI = {
    async getAll() {
        const response = await fetch(`${API_BASE}/accounting`);
        if (!response.ok) throw new Error('Failed to fetch accounting records');
        return response.json();
    },

    async getByProject(projectId) {
        const response = await fetch(`${API_BASE}/accounting/project/${projectId}`);
        if (!response.ok) throw new Error('Failed to fetch accounting records');
        return response.json();
    },

    async create(recordData) {
        const response = await fetch(`${API_BASE}/accounting`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recordData)
        });
        if (!response.ok) throw new Error('Failed to create accounting record');
        return response.json();
    },

    async delete(id) {
        const response = await fetch(`${API_BASE}/accounting/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete accounting record');
        return response.json();
    }
};

window.AccountingAPI = AccountingAPI;
```

3. **Create accounting routes** (server/routes/accounting.js):
```javascript
const express = require('express');
const router = express.Router();
const { accountingQueries } = require('../models/database');

router.get('/', (req, res) => {
    try {
        const records = accountingQueries.getAll.all();
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/project/:projectId', (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        const records = accountingQueries.findByProject.all(projectId);
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', (req, res) => {
    try {
        const { project_id, transaction_type, category, amount, transaction_date, description } = req.body;

        if (!transaction_type || !amount) {
            return res.status(400).json({ error: 'transaction_type and amount are required' });
        }

        const result = accountingQueries.create.run(
            project_id || null,
            transaction_type,
            category || null,
            amount,
            transaction_date || null,
            description || null
        );

        const record = accountingQueries.findById.get(result.lastInsertRowid);
        res.json(record);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        accountingQueries.delete.run(id);
        res.json({ success: true, message: 'Accounting record deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
```

4. **Register route in alternaview-server.js:**
```javascript
app.use('/api/accounting', require('./server/routes/accounting'));
```

5. **Replace accounting record operations:**
```javascript
// OLD
const records = JSON.parse(localStorage.getItem('accounting') || '[]');
records.push(newRecord);
localStorage.setItem('accounting', JSON.stringify(records));

// NEW
const newRecord = await AccountingAPI.create({
    project_id: projectId,           // Optional - can be null
    transaction_type: 'income',      // 'income' or 'expense'
    category: 'service_revenue',     // Custom categories
    amount: 5000,                    // Positive for income, negative for expense
    transaction_date: '2025-01-15',
    description: 'Project payment received'
});

// Load all records
const records = await AccountingAPI.getAll();

// Load by project
const projectRecords = await AccountingAPI.getByProject(projectId);

// Delete record
await AccountingAPI.delete(recordId);
```

**Accounting Record Structure:**
```javascript
{
    project_id: INTEGER,              // Optional - link to projects table
    transaction_type: TEXT,           // Required - 'income' or 'expense'
    category: TEXT,                   // Custom categories
    amount: REAL,                     // Required - transaction amount
    transaction_date: DATE,           // When transaction occurred
    description: TEXT                 // Transaction description
}
```

---

## Common Patterns & Best Practices

### 1. Error Handling
Always wrap API calls in try/catch:
```javascript
try {
    const result = await SomeAPI.create(data);
    // Update UI
} catch (error) {
    console.error('Error:', error);
    alert('Failed to save. Please try again.');
}
```

### 2. Optimistic UI Updates
Update local state immediately, then sync to API:
```javascript
// Update UI immediately
localData.push(newItem);
renderUI();

// Then save to API
try {
    await SomeAPI.create(newItem);
} catch (error) {
    // Rollback on error
    localData = localData.filter(item => item !== newItem);
    renderUI();
    alert('Failed to save');
}
```

### 3. Loading States
Show loading indicators for async operations:
```javascript
async function loadData() {
    showLoadingSpinner();
    try {
        const data = await SomeAPI.getAll();
        renderData(data);
    } catch (error) {
        showError(error);
    } finally {
        hideLoadingSpinner();
    }
}
```

### 4. Refresh After Changes
Reload data after create/update/delete:
```javascript
async function deleteItem(id) {
    await SomeAPI.delete(id);
    await loadAllData(); // Refresh from server
}
```

---

## Testing Checklist

After migrating each page:

- [ ] Load page - data loads from API
- [ ] Create new record - saves to database
- [ ] Update existing record - changes persist
- [ ] Delete record - removes from database
- [ ] Reload page - data still there (not in localStorage)
- [ ] Check browser DevTools > Application > Local Storage - should be empty for that data
- [ ] Check database directly:
  ```bash
  sqlite3 ~/alternassist/alternaview.db
  SELECT * FROM [table_name];
  ```

---

## Migration Completion Steps

1. Migrate invoice_generator_standalone.html
2. Create accounting routes and migrate accounting.html
3. Migrate payment_dashboard.html
4. Test all pages thoroughly
5. Run localStorage migration script (migrate-localstorage.js)
6. Clear localStorage data
7. Verify app works without localStorage
8. Update MIGRATION-COMPLETE.md with final status
9. Commit and push to GitHub

---

## Troubleshooting

### "Failed to fetch" errors
- Check that server is running (npm start)
- Verify API URL is `http://localhost:3000/api/...`
- Check browser console for CORS errors

### Data not persisting
- Verify API call is using `await`
- Check that create/update returns success
- Inspect database to confirm data was saved

### Project linking issues
- Ensure project_id is an INTEGER, not string
- Verify project exists before creating related records
- Check foreign key constraints in database schema

---

## Additional Resources

- **API Helper Reference:** [/HTML Sketches/api-helpers.js](HTML%20Sketches/api-helpers.js)
- **Database Schema:** [/server/models/database.js](server/models/database.js)
- **Example Migration:** [/HTML Sketches/cue_tracker_demo.html](HTML%20Sketches/cue_tracker_demo.html)
- **Example Migration:** [/HTML Sketches/estimate_calculator.html](HTML%20Sketches/estimate_calculator.html)

---

**Note:** Once all pages are migrated, run the localStorage migration script to transfer any existing data, then clear localStorage to complete the migration.
