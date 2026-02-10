<script lang="ts">
	import { accountingAPI } from '$lib/api';
	import { onMount } from 'svelte';

	// State
	let transactions = $state<any[]>([]);
	let csvData = $state<any>(null);
	let currentDateRange = $state({ start: '', end: '' });
	let activeCategoryPicker = $state<any>(null);
	let currentlyEditing = $state<any>(null);
	let periodLabel = $state('Last 30 days');

	// Active tab
	let activeTab = $state('overview');

	// Filters
	let incomeCategory = $state('all');
	let incomeSearch = $state('');
	let expenseCategory = $state('all');
	let expenseSearch = $state('');

	// Stats derived
	const stats = $derived.by(() => {
		let filtered = transactions;
		if (currentDateRange.start && currentDateRange.end) {
			filtered = transactions.filter(
				(t) => t.date >= currentDateRange.start && t.date <= currentDateRange.end
			);
		}

		const income = filtered.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);

		const expenses = filtered
			.filter((t) => t.type === 'expense')
			.reduce((sum, t) => sum + Math.abs(t.amount), 0);

		const net = income - expenses;
		const tax = net * 0.3;

		const incomeCount = filtered.filter((t) => t.type === 'income').length;
		const expenseCount = filtered.filter((t) => t.type === 'expense').length;

		return {
			netIncome: net,
			totalIncome: income,
			totalExpenses: expenses,
			taxEstimate: tax,
			incomeCount,
			expenseCount
		};
	});

	onMount(async () => {
		resetToLast30Days();
		await loadTransactions();

		// Set up expense date to today
		setTimeout(() => {
			const dateInput = document.getElementById('expenseDate') as HTMLInputElement;
			if (dateInput) dateInput.valueAsDate = new Date();
		}, 100);

		// Close modals when clicking outside
		const modals = document.querySelectorAll('.modal');
		modals.forEach((modal) => {
			modal.addEventListener('click', function (e) {
				if (e.target === this) {
					this.classList.remove('active');
				}
			});
		});
	});

	async function loadTransactions() {
		try {
			const records = await accountingAPI.getAll();
			transactions = records.map((record: any) => ({
				id: record.id,
				type: record.transaction_type,
				date: record.transaction_date,
				description: record.description || '',
				category: record.category || '',
				account: record.account || 'Business Checking',
				amount: Math.abs(record.amount),
				taxCategory: record.tax_category || 'other_tax',
				notes: record.notes || '',
				customName: record.custom_name || '',
				invoice: record.invoice || '',
				receipt: record.receipt || null
			}));

			await loadIncomeFromPayments();
			updateStats();
		} catch (error) {
			console.error('Error loading transactions:', error);
		}
	}

	async function loadIncomeFromPayments() {
		try {
			const response = await fetch('/api/payments/with-projects');
			const paymentsWithProjects = await response.json();

			const paidPayments = paymentsWithProjects.filter((p: any) => p.payment_date !== null);

			for (const payment of paidPayments) {
				const exists = transactions.some(
					(t) => t.type === 'income' && t.description.includes(payment.project_name)
				);

				if (!exists) {
					transactions.push({
						id: `payment-${payment.id}`,
						type: 'income',
						date: payment.payment_date,
						description: `Payment for ${payment.project_name || 'Project'}`,
						category: 'income',
						account: 'Business Checking',
						amount: payment.amount,
						notes: payment.notes || 'Payment received',
						customName: '',
						invoice: '',
						receipt: null
					});
				}
			}
		} catch (error) {
			console.error('Error loading income from payments:', error);
		}
	}

	async function addExpense(event: Event) {
		event.preventDefault();

		const form = event.target as HTMLFormElement;
		const formData = new FormData(form);

		try {
			const description = formData.get('expenseDescription') as string;
			const notes = formData.get('expenseNotes') as string;
			const fullDescription = notes ? `${description} - ${notes}` : description;

			const recordData = {
				transaction_type: 'expense',
				category: formData.get('expenseCategory'),
				amount: -Math.abs(parseFloat(formData.get('expenseAmount') as string)),
				transaction_date: formData.get('expenseDate'),
				description: fullDescription,
				account: formData.get('expenseAccount'),
				tax_category: formData.get('expenseTaxCategory'),
				notes: notes,
				project_id: null
			} as any;

			await accountingAPI.create(recordData);
			await loadTransactions();
			closeExpenseModal();

			form.reset();
			const dateInput = form.querySelector('#expenseDate') as HTMLInputElement;
			if (dateInput) dateInput.valueAsDate = new Date();
		} catch (error) {
			console.error('Error adding expense:', error);
			alert('Failed to add expense. Please try again.');
		}
	}

	async function deleteTransaction(id: number | string) {
		if (typeof id === 'string') return; // Can't delete payment transactions

		if (confirm('Are you sure you want to delete this transaction?')) {
			try {
				await accountingAPI.delete(id);
				await loadTransactions();
			} catch (error) {
				console.error('Error deleting transaction:', error);
				alert('Failed to delete transaction.');
			}
		}
	}

	function switchTab(tabName: string) {
		activeTab = tabName;
	}

	function resetToLast30Days() {
		const today = new Date();
		const thirtyDaysAgo = new Date(today);
		thirtyDaysAgo.setDate(today.getDate() - 30);

		currentDateRange.start = thirtyDaysAgo.toISOString().split('T')[0];
		currentDateRange.end = today.toISOString().split('T')[0];
		periodLabel = 'Last 30 days';
	}

	function applyDateRange() {
		if (!currentDateRange.start || !currentDateRange.end) {
			alert('Please select both start and end dates');
			return;
		}

		const start = new Date(currentDateRange.start);
		const end = new Date(currentDateRange.end);
		const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

		periodLabel = `${days} days`;
		transactions = [...transactions];
	}

	function updateStats() {
		transactions = [...transactions];
	}

	function formatDate(dateString: string) {
		const date = new Date(dateString + 'T00:00:00');
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatCategory(category: string) {
		const categories: Record<string, string> = {
			income: 'Income',
			software: 'Software',
			equipment: 'Equipment',
			marketing: 'Marketing',
			travel: 'Travel',
			office: 'Office',
			professional: 'Professional',
			other: 'Other'
		};
		return categories[category] || category;
	}

	function formatTaxCategory(taxCat: string) {
		if (!taxCat) return '-';
		const taxCategories: Record<string, string> = {
			home_office: 'Home Office',
			business_meals: 'Business Meals (50%)',
			vehicles: 'Vehicles',
			travel: 'Travel',
			professional_fees: 'Professional Fees',
			insurance: 'Insurance',
			advertising: 'Advertising',
			supplies: 'Supplies & Equipment',
			startup: 'Start-up Costs',
			interest: 'Interest',
			taxes: 'Taxes & Licenses',
			depreciation: 'Depreciation',
			personal: 'Personal',
			other_tax: 'Other'
		};
		return taxCategories[taxCat] || taxCat;
	}

	function openExpenseModal() {
		const modal = document.getElementById('expenseModal');
		if (modal) modal.classList.add('active');
	}

	function closeExpenseModal() {
		const modal = document.getElementById('expenseModal');
		if (modal) modal.classList.remove('active');
	}

	function openEditModal() {
		const modal = document.getElementById('editModal');
		if (modal) modal.classList.add('active');
	}

	function closeEditModal() {
		const modal = document.getElementById('editModal');
		if (modal) modal.classList.remove('active');
	}

	function openBulkEditModal() {
		const selectedIds = getSelectedIds();
		if (selectedIds.length === 0) return;

		const bulkEditCount = document.getElementById('bulkEditCount');
		if (bulkEditCount) bulkEditCount.textContent = selectedIds.length.toString();

		const modal = document.getElementById('bulkEditModal');
		if (modal) modal.classList.add('active');
	}

	function closeBulkEditModal() {
		const modal = document.getElementById('bulkEditModal');
		if (modal) modal.classList.remove('active');
		const form = document.getElementById('bulkEditForm') as HTMLFormElement;
		if (form) form.reset();
	}

	function editTransaction(id: number) {
		const transaction = transactions.find((t) => t.id === id);
		if (!transaction) return;

		(document.getElementById('editTransactionId') as HTMLInputElement).value = transaction.id;
		(document.getElementById('editDate') as HTMLInputElement).value = transaction.date;
		(document.getElementById('editDescription') as HTMLInputElement).value = transaction.description;
		(document.getElementById('editCategory') as HTMLSelectElement).value = transaction.category;
		(document.getElementById('editAccount') as HTMLInputElement).value = transaction.account || '';
		(document.getElementById('editTaxCategory') as HTMLSelectElement).value =
			transaction.taxCategory || 'other_tax';
		(document.getElementById('editAmount') as HTMLInputElement).value = transaction.amount;
		(document.getElementById('editNotes') as HTMLTextAreaElement).value = transaction.notes || '';

		openEditModal();
	}

	async function saveEdit(event: Event) {
		event.preventDefault();

		const id = parseInt((document.getElementById('editTransactionId') as HTMLInputElement).value);
		const transaction = transactions.find((t) => t.id === id);

		if (transaction) {
			transaction.date = (document.getElementById('editDate') as HTMLInputElement).value;
			transaction.description = (document.getElementById('editDescription') as HTMLInputElement)
				.value;
			transaction.category = (document.getElementById('editCategory') as HTMLSelectElement).value;
			transaction.account = (document.getElementById('editAccount') as HTMLInputElement).value;
			transaction.taxCategory = (document.getElementById('editTaxCategory') as HTMLSelectElement)
				.value;
			transaction.notes = (document.getElementById('editNotes') as HTMLTextAreaElement).value;

			// Update via API (delete + recreate since no update endpoint exists)
			try {
				await accountingAPI.delete(id);
				await accountingAPI.create({
					transaction_type: transaction.type,
					category: transaction.category,
					amount: transaction.type === 'expense' ? -Math.abs(transaction.amount) : transaction.amount,
					transaction_date: transaction.date,
					description: transaction.description,
					account: transaction.account,
					tax_category: transaction.taxCategory,
					notes: transaction.notes,
					project_id: null
				});
				await loadTransactions();
				closeEditModal();
			} catch (error) {
				console.error('Error saving transaction:', error);
			}
		}
	}

	function editCell(cell: HTMLElement, transactionId: number, field: string, inputType: string) {
		// Prevent editing if already editing another cell
		if (currentlyEditing && currentlyEditing !== cell) {
			return;
		}

		const transaction = transactions.find((t) => t.id === transactionId);
		if (!transaction) return;

		currentlyEditing = cell;
		const originalContent = cell.innerHTML;
		let currentValue = transaction[field] || '';

		if (inputType === 'date') {
			// Create date input
			const input = document.createElement('input');
			input.type = 'date';
			input.value = currentValue;
			cell.innerHTML = '';
			cell.appendChild(input);
			input.focus();

			const saveValue = async () => {
				if (input.value) {
					transaction[field] = input.value;
					cell.innerHTML = formatDate(input.value);
					updateStats();
				} else {
					cell.innerHTML = originalContent;
				}
				currentlyEditing = null;
			};

			input.addEventListener('blur', saveValue);
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') saveValue();
				if (e.key === 'Escape') {
					cell.innerHTML = originalContent;
					currentlyEditing = null;
				}
			});
		} else {
			// Create text input
			const input = document.createElement('input');
			input.type = 'text';
			input.value = currentValue === '-' ? '' : currentValue;
			cell.innerHTML = '';
			cell.appendChild(input);
			input.focus();
			input.select();

			const saveValue = async () => {
				const newValue = input.value || '-';
				transaction[field] = input.value;
				cell.innerHTML = newValue;
				updateStats();
				currentlyEditing = null;
			};

			input.addEventListener('blur', saveValue);
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') saveValue();
				if (e.key === 'Escape') {
					cell.innerHTML = originalContent;
					currentlyEditing = null;
				}
			});
		}
	}

	function openCategoryPicker(transactionId: number, badgeElement: HTMLElement) {
		// Close any existing picker
		if (activeCategoryPicker) {
			activeCategoryPicker.remove();
			activeCategoryPicker = null;
		}

		const transaction = transactions.find((t) => t.id === transactionId);
		if (!transaction) return;

		const categories = [
			{ value: 'home_office', label: 'HOME OFFICE' },
			{ value: 'business_meals', label: 'BUSINESS MEALS (50%)' },
			{ value: 'vehicles', label: 'VEHICLES' },
			{ value: 'travel', label: 'TRAVEL' },
			{ value: 'professional_fees', label: 'PROFESSIONAL FEES' },
			{ value: 'insurance', label: 'INSURANCE' },
			{ value: 'advertising', label: 'ADVERTISING' },
			{ value: 'supplies', label: 'SUPPLIES & EQUIPMENT' },
			{ value: 'startup', label: 'START-UP COSTS' },
			{ value: 'interest', label: 'INTEREST' },
			{ value: 'taxes', label: 'TAXES & LICENSES' },
			{ value: 'depreciation', label: 'DEPRECIATION' },
			{ value: 'personal', label: 'PERSONAL' },
			{ value: 'other_tax', label: 'OTHER' }
		];

		const picker = document.createElement('div');
		picker.className = 'category-picker';

		categories.forEach((cat) => {
			const option = document.createElement('div');
			option.className = 'category-option';
			option.innerHTML = `<span class="category-badge cat-${cat.value}">${cat.label}</span>`;
			option.onclick = (e) => {
				e.stopPropagation();
				transaction.taxCategory = cat.value;
				badgeElement.className = `category-badge cat-${cat.value}`;
				badgeElement.textContent = cat.label;
				updateStats();
				picker.remove();
				activeCategoryPicker = null;
			};
			picker.appendChild(option);
		});

		// Position the picker near the badge
		const rect = badgeElement.getBoundingClientRect();
		picker.style.position = 'fixed';
		picker.style.top = rect.bottom + 5 + 'px';
		picker.style.left = rect.left + 'px';

		document.body.appendChild(picker);
		activeCategoryPicker = picker;

		// Close picker when clicking outside
		setTimeout(() => {
			document.addEventListener(
				'click',
				function closePickerOnClick(e) {
					if (!picker.contains(e.target as Node) && e.target !== badgeElement) {
						picker.remove();
						activeCategoryPicker = null;
						document.removeEventListener('click', closePickerOnClick);
					}
				},
				{ once: false }
			);
		}, 10);
	}

	function toggleSelectAll() {
		const selectAll = (document.getElementById('selectAllExpenses') as HTMLInputElement)?.checked;
		document.querySelectorAll('.expense-checkbox').forEach((checkbox) => {
			(checkbox as HTMLInputElement).checked = selectAll || false;
		});
		updateBulkActions();
	}

	function updateBulkActions() {
		const selected = document.querySelectorAll('.expense-checkbox:checked');
		const count = selected.length;

		const selectedCount = document.getElementById('selectedCount');
		if (selectedCount) selectedCount.textContent = count.toString();

		const bulkActions = document.getElementById('expenseBulkActions');
		if (bulkActions) {
			if (count > 0) {
				bulkActions.classList.add('active');
			} else {
				bulkActions.classList.remove('active');
			}
		}
	}

	function getSelectedIds() {
		const selected = document.querySelectorAll('.expense-checkbox:checked');
		return Array.from(selected).map((cb) => parseInt((cb as HTMLInputElement).dataset.id || '0'));
	}

	async function saveBulkEdit(event: Event) {
		event.preventDefault();

		const selectedIds = getSelectedIds();
		const category = (document.getElementById('bulkCategory') as HTMLSelectElement).value;
		const account = (document.getElementById('bulkAccount') as HTMLInputElement).value;
		const taxCategory = (document.getElementById('bulkTaxCategory') as HTMLSelectElement).value;

		selectedIds.forEach((id) => {
			const transaction = transactions.find((t) => t.id === id);
			if (transaction) {
				if (category) transaction.category = category;
				if (account) transaction.account = account;
				if (taxCategory) transaction.taxCategory = taxCategory;
			}
		});

		updateStats();
		closeBulkEditModal();

		// Clear selections
		document.querySelectorAll('.expense-checkbox').forEach((cb) => {
			(cb as HTMLInputElement).checked = false;
		});
		const selectAllCheckbox = document.getElementById('selectAllExpenses') as HTMLInputElement;
		if (selectAllCheckbox) selectAllCheckbox.checked = false;
		updateBulkActions();
	}

	async function bulkDeleteExpenses() {
		const selectedIds = getSelectedIds();
		if (selectedIds.length === 0) return;

		if (confirm(`Are you sure you want to delete ${selectedIds.length} transaction(s)?`)) {
			try {
				for (const id of selectedIds) {
					await accountingAPI.delete(id);
				}
				await loadTransactions();

				// Clear selections
				const selectAllCheckbox = document.getElementById('selectAllExpenses') as HTMLInputElement;
				if (selectAllCheckbox) selectAllCheckbox.checked = false;
				updateBulkActions();
			} catch (error) {
				console.error('Error deleting transactions:', error);
			}
		}
	}

	function openReceiptUpload(transactionId: number) {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*,.pdf';
		input.onchange = (e) => {
			const file = (e.target as HTMLInputElement)?.files?.[0];
			if (file) {
				attachReceiptToTransaction(transactionId, file);
			}
		};
		input.click();
	}

	function handleReceiptDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).classList.add('dragover');
	}

	function handleReceiptDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).classList.remove('dragover');
	}

	function handleReceiptDrop(event: DragEvent, transactionId: number) {
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).classList.remove('dragover');

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			attachReceiptToTransaction(transactionId, files[0]);
		}
	}

	function attachReceiptToTransaction(transactionId: number, file: File) {
		const transaction = transactions.find((t) => t.id === transactionId);
		if (!transaction) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			transaction.receipt = {
				name: file.name,
				type: file.type,
				data: e.target?.result,
				uploadedAt: new Date().toISOString()
			};
			transactions = [...transactions];
		};
		reader.readAsDataURL(file);
	}

	function viewReceipt(transactionId: number) {
		const transaction = transactions.find((t) => t.id === transactionId);
		if (!transaction || !transaction.receipt) return;

		const modal = document.createElement('div');
		modal.className = 'modal active';
		modal.innerHTML = `
			<div class="modal-content" style="max-width: 800px;">
				<div class="modal-header">
					<h3 class="modal-title">Receipt - ${transaction.description}</h3>
				</div>
				<div style="text-align: center;">
					${
						transaction.receipt.type.includes('pdf')
							? `<p>PDF: ${transaction.receipt.name}</p><a href="${transaction.receipt.data}" download="${transaction.receipt.name}" class="btn btn-primary">Download PDF</a>`
							: `<img src="${transaction.receipt.data}" style="max-width: 100%; border-radius: 8px;">`
					}
				</div>
				<div class="form-actions" style="margin-top: 1.5rem;">
					<button class="btn btn-primary" onclick="document.querySelector('.modal.active')?.remove()">close</button>
				</div>
			</div>
		`;
		document.body.appendChild(modal);

		modal.addEventListener('click', (e) => {
			if (e.target === modal) modal.remove();
		});
	}

	function handleCSVUpload(event: Event) {
		const file = (event.target as HTMLInputElement)?.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = function (e) {
			const text = e.target?.result as string;
			parseCSV(text);
		};
		reader.readAsText(file);
	}

	function parseCSV(text: string) {
		const lines = text.trim().split('\n');
		const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

		csvData = {
			headers: headers,
			rows: lines.slice(1).map((line) => {
				// Handle CSV values that might contain commas within quotes
				const values: string[] = [];
				let current = '';
				let inQuotes = false;

				for (let char of line) {
					if (char === '"') {
						inQuotes = !inQuotes;
					} else if (char === ',' && !inQuotes) {
						values.push(current.trim().replace(/"/g, ''));
						current = '';
					} else {
						current += char;
					}
				}
				values.push(current.trim().replace(/"/g, ''));
				return values;
			})
		};

		showCSVPreview();
	}

	function showCSVPreview() {
		const previewSection = document.getElementById('csvPreviewSection');
		if (previewSection) previewSection.style.display = 'block';

		// Populate column selectors
		const selectors = ['csvDateColumn', 'csvDescColumn', 'csvAmountColumn'];
		selectors.forEach((id) => {
			const select = document.getElementById(id) as HTMLSelectElement;
			if (select && csvData) {
				select.innerHTML = csvData.headers
					.map((h: string, i: number) => `<option value="${i}">${h}</option>`)
					.join('');
			}
		});

		// Auto-detect columns
		if (csvData) {
			csvData.headers.forEach((header: string, i: number) => {
				const lower = header.toLowerCase();
				if (lower.includes('date') || lower.includes('posted')) {
					const dateCol = document.getElementById('csvDateColumn') as HTMLSelectElement;
					if (dateCol) dateCol.value = i.toString();
				} else if (
					lower.includes('description') ||
					lower.includes('memo') ||
					lower.includes('merchant')
				) {
					const descCol = document.getElementById('csvDescColumn') as HTMLSelectElement;
					if (descCol) descCol.value = i.toString();
				} else if (
					lower.includes('amount') ||
					lower.includes('debit') ||
					lower.includes('credit')
				) {
					const amountCol = document.getElementById('csvAmountColumn') as HTMLSelectElement;
					if (amountCol) amountCol.value = i.toString();
				}
			});
		}

		// Show preview table
		if (csvData) {
			const previewHTML = `
				<table class="transaction-table">
					<thead>
						<tr>${csvData.headers.map((h: string) => `<th>${h}</th>`).join('')}</tr>
					</thead>
					<tbody>
						${csvData.rows
							.slice(0, 5)
							.map(
								(row: string[]) => `
							<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>
						`
							)
							.join('')}
					</tbody>
				</table>
			`;
			const previewTable = document.getElementById('csvPreviewTable');
			if (previewTable) previewTable.innerHTML = previewHTML;
		}
	}

	async function processCSVImport() {
		if (!csvData) return;

		const dateCol = parseInt(
			(document.getElementById('csvDateColumn') as HTMLSelectElement).value
		);
		const descCol = parseInt(
			(document.getElementById('csvDescColumn') as HTMLSelectElement).value
		);
		const amountCol = parseInt(
			(document.getElementById('csvAmountColumn') as HTMLSelectElement).value
		);

		let imported = 0;
		for (const row of csvData.rows) {
			if (row.length < 3) continue; // Skip empty rows

			let amount = parseFloat(row[amountCol].replace(/[^0-9.-]/g, ''));
			if (isNaN(amount)) continue;

			const description = row[descCol] || 'Imported transaction';
			const descLower = description.toLowerCase();

			// Skip payment transactions
			if (descLower.includes('payment - thank you') || descLower.includes('autopay payment')) {
				continue;
			}

			// In bank CSVs, positive = expense, negative = refund/credit
			const isExpense = amount > 0;
			const taxCategory = isExpense ? detectTaxCategory(descLower) : null;

			const transaction = {
				type: isExpense ? 'expense' : 'income',
				date: formatCSVDate(row[dateCol]),
				description: description,
				category: isExpense ? 'other' : 'income',
				account: 'Imported Account',
				taxCategory: taxCategory,
				amount: Math.abs(amount),
				notes: 'Imported from CSV'
			};

			// Check for duplicates
			const isDuplicate = transactions.some(
				(t) =>
					t.date === transaction.date &&
					t.amount === transaction.amount &&
					t.description === transaction.description
			);

			if (!isDuplicate) {
				try {
					await accountingAPI.create({
						project_id: null,
						transaction_type: transaction.type,
						category: transaction.category,
						amount: isExpense ? -transaction.amount : transaction.amount,
						transaction_date: transaction.date,
						description: transaction.description,
						account: transaction.account,
						tax_category: transaction.taxCategory,
						notes: transaction.notes
					});
					imported++;
				} catch (error) {
					console.error('Error importing transaction:', error);
				}
			}
		}

		await loadTransactions();
		alert(`Successfully imported ${imported} transactions!`);
		cancelImport();
	}

	function formatCSVDate(dateStr: string) {
		// Try to parse various date formats
		let date = new Date(dateStr);

		// If invalid, try MM/DD/YYYY format
		if (isNaN(date.getTime())) {
			const parts = dateStr.split('/');
			if (parts.length === 3) {
				date = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
			}
		}

		// Return ISO format
		return date.toISOString().split('T')[0];
	}

	function cancelImport() {
		const previewSection = document.getElementById('csvPreviewSection');
		if (previewSection) previewSection.style.display = 'none';

		const fileInput = document.getElementById('csvFileInput') as HTMLInputElement;
		if (fileInput) fileInput.value = '';

		csvData = null;
	}

	function detectTaxCategory(description: string) {
		const desc = description.toLowerCase();

		// Home office/utilities
		if (desc.includes('spectrum') || desc.includes('cable') || desc.includes('internet')) {
			return 'home_office';
		}
		// Business meals/restaurants
		if (desc.includes('diner') || desc.includes('restaurant') || desc.includes('swingers')) {
			return 'business_meals';
		}
		// Travel/parking
		if (desc.includes('parking') || desc.includes('passport')) {
			return 'travel';
		}
		// Professional fees
		if (
			desc.includes('loffredo') ||
			desc.includes('professional') ||
			desc.includes('tax1099')
		) {
			return 'professional_fees';
		}
		// Advertising
		if (desc.includes('distrokid') || desc.includes('marketing')) {
			return 'advertising';
		}
		// Supplies & equipment (software, subscriptions, equipment)
		if (
			desc.includes('frame.io') ||
			desc.includes('soundly') ||
			desc.includes('waves') ||
			desc.includes('claude') ||
			desc.includes('software') ||
			desc.includes('quickbooks') ||
			desc.includes('computer') ||
			desc.includes('best buy') ||
			desc.includes('guitar center') ||
			desc.includes('splice') ||
			desc.includes('avid') ||
			desc.includes('acustica') ||
			desc.includes('audinate') ||
			desc.includes('d16') ||
			desc.includes('cleverbridge') ||
			desc.includes('paddle') ||
			desc.includes('accentize') ||
			desc.includes('xfer')
		) {
			return 'supplies';
		}
		// Taxes/licenses
		if (desc.includes('government') || desc.includes('nic*online')) {
			return 'taxes';
		}
		// Foreign transaction fees
		if (desc.includes('foreign transaction')) {
			return 'interest';
		}

		return 'other_tax';
	}

	// Filtered transactions for each tab
	const overviewTransactions = $derived.by(() => {
		let filtered = transactions.filter((t) => {
			if (!currentDateRange.start || !currentDateRange.end) return true;
			return t.date >= currentDateRange.start && t.date <= currentDateRange.end;
		});
		return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	});

	const incomeTransactions = $derived.by(() => {
		let filtered = transactions.filter((t) => t.type === 'income');

		// Category filter
		if (incomeCategory !== 'all') {
			filtered = filtered.filter((t) => t.category === incomeCategory);
		}

		// Search filter
		if (incomeSearch) {
			const searchTerm = incomeSearch.toLowerCase();
			filtered = filtered.filter(
				(t) =>
					t.description.toLowerCase().includes(searchTerm) ||
					(t.invoice && t.invoice.toLowerCase().includes(searchTerm)) ||
					(t.account && t.account.toLowerCase().includes(searchTerm)) ||
					(t.notes && t.notes.toLowerCase().includes(searchTerm))
			);
		}

		return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	});

	const expenseTransactions = $derived.by(() => {
		let filtered = transactions.filter((t) => t.type === 'expense');

		// Category filter
		if (expenseCategory !== 'all') {
			filtered = filtered.filter((t) => t.category === expenseCategory);
		}

		// Search filter
		if (expenseSearch) {
			const searchTerm = expenseSearch.toLowerCase();
			filtered = filtered.filter(
				(t) =>
					t.description.toLowerCase().includes(searchTerm) ||
					(t.account && t.account.toLowerCase().includes(searchTerm)) ||
					(t.notes && t.notes.toLowerCase().includes(searchTerm)) ||
					formatCategory(t.category).toLowerCase().includes(searchTerm)
			);
		}

		return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	});
</script>

<div class="dashboard-container">
	<div class="stats-grid">
		<div class="stat-card">
			<div class="stat-label">Net Income</div>
			<div class="stat-value" class:green={stats.netIncome >= 0} class:red={stats.netIncome < 0}>
				${stats.netIncome.toFixed(2)}
			</div>
			<div class="stat-subtitle">{periodLabel}</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Total Income</div>
			<div class="stat-value blue">${stats.totalIncome.toFixed(2)}</div>
			<div class="stat-subtitle">
				{stats.incomeCount} transaction{stats.incomeCount !== 1 ? 's' : ''}
			</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Total Expenses</div>
			<div class="stat-value red">${stats.totalExpenses.toFixed(2)}</div>
			<div class="stat-subtitle">
				{stats.expenseCount} transaction{stats.expenseCount !== 1 ? 's' : ''}
			</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Tax Estimate</div>
			<div class="stat-value purple">${stats.taxEstimate.toFixed(2)}</div>
			<div class="stat-subtitle">30% of net income</div>
		</div>
	</div>

	<!-- Tab Navigation -->
	<div class="tab-nav">
		<button class="tab-btn" class:active={activeTab === 'overview'} onclick={() => switchTab('overview')}>
			overview
		</button>
		<button class="tab-btn" class:active={activeTab === 'income'} onclick={() => switchTab('income')}>
			income
		</button>
		<button class="tab-btn" class:active={activeTab === 'expenses'} onclick={() => switchTab('expenses')}>
			expenses
		</button>
		<button class="tab-btn" class:active={activeTab === 'import'} onclick={() => switchTab('import')}>
			import
		</button>
	</div>

	<!-- Overview Tab -->
	{#if activeTab === 'overview'}
		<div class="section">
			<div class="section-header">
				<h2 class="section-title">Last 30 Days</h2>
			</div>

			<div class="date-range-controls">
				<label style="color: var(--subtle-text); font-size: 0.9rem;">Custom Range:</label>
				<input type="date" bind:value={currentDateRange.start} />
				<span style="color: var(--muted-text);">to</span>
				<input type="date" bind:value={currentDateRange.end} />
				<button class="btn btn-gradient" onclick={applyDateRange}>apply</button>
				<button class="btn btn-secondary" onclick={resetToLast30Days}>last 30 days</button>
			</div>

			{#if overviewTransactions.length === 0}
				<div class="empty-state">
					<h3>No transactions in this period</h3>
					<p>Adjust the date range or add transactions.</p>
				</div>
			{:else}
				<table class="transaction-table">
					<thead>
						<tr>
							<th>Date</th>
							<th>Description</th>
							<th>Category</th>
							<th>Account</th>
							<th>Amount</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each overviewTransactions as t}
							<tr>
								<td>{formatDate(t.date)}</td>
								<td>
									{#if t.invoice}<small style="color: var(--muted-text);">#{t.invoice}</small><br />{/if}
									{t.description}
									{#if t.notes}
										<br /><small style="color: var(--muted-text);">{t.notes}</small>
									{/if}
								</td>
								<td>
									<span class="category-badge cat-{t.taxCategory || t.category}">
										{t.type === 'income' ? formatCategory(t.category) : formatTaxCategory(t.taxCategory)}
									</span>
								</td>
								<td>{t.account || '-'}</td>
								<td class:amount-income={t.type === 'income'} class:amount-expense={t.type === 'expense'}>
									{t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
								</td>
								<td>
									<div class="action-buttons">
										{#if t.type === 'expense' && typeof t.id === 'number'}
											<button class="delete-btn" onclick={() => deleteTransaction(t.id)} title="Delete">
												<svg
													width="16"
													height="16"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
												>
													<polyline points="3 6 5 6 21 6"></polyline>
													<path
														d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
													></path>
													<line x1="10" y1="11" x2="10" y2="17"></line>
													<line x1="14" y1="11" x2="14" y2="17"></line>
												</svg>
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	{/if}

	<!-- Income Tab -->
	{#if activeTab === 'income'}
		<div class="section">
			<div class="section-header">
				<h2 class="section-title">Income Transactions</h2>
			</div>

			<div class="filter-controls">
				<select bind:value={incomeCategory}>
					<option value="all">All Categories</option>
					<option value="income">Client Payments</option>
				</select>
				<input
					type="text"
					class="search-input"
					bind:value={incomeSearch}
					placeholder="Search transactions..."
				/>
			</div>

			{#if incomeTransactions.length === 0}
				<div class="empty-state">
					<h3>No income transactions found</h3>
					<p>
						{incomeSearch ? 'Try adjusting your search or filters.' : 'Income from payments will appear here automatically.'}
					</p>
				</div>
			{:else}
				<table class="transaction-table">
					<thead>
						<tr>
							<th>Date</th>
							<th>Project</th>
							<th>Invoice #</th>
							<th>Description</th>
							<th>Account</th>
							<th>Amount</th>
						</tr>
					</thead>
					<tbody>
						{#each incomeTransactions as t}
							<tr>
								<td
									class="editable-cell"
									onclick={(e) => editCell(e.currentTarget as HTMLElement, t.id, 'date', 'date')}
								>
									{formatDate(t.date)}
								</td>
								<td
									class="editable-cell"
									onclick={(e) => editCell(e.currentTarget as HTMLElement, t.id, 'customName', 'text')}
								>
									{t.customName || '-'}
								</td>
								<td
									class="editable-cell"
									onclick={(e) => editCell(e.currentTarget as HTMLElement, t.id, 'invoice', 'text')}
								>
									{t.invoice || '-'}
								</td>
								<td
									class="editable-cell"
									onclick={(e) => editCell(e.currentTarget as HTMLElement, t.id, 'description', 'text')}
								>
									{t.description}
									{#if t.notes}
										<br /><small style="color: var(--muted-text);">{t.notes}</small>
									{/if}
								</td>
								<td
									class="editable-cell"
									onclick={(e) => editCell(e.currentTarget as HTMLElement, t.id, 'account', 'text')}
								>
									{t.account || '-'}
								</td>
								<td class="amount-income">+${t.amount.toFixed(2)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	{/if}

	<!-- Expenses Tab -->
	{#if activeTab === 'expenses'}
		<div class="section">
			<div class="section-header">
				<h2 class="section-title">Expense Transactions</h2>
				<button class="btn btn-primary" onclick={openExpenseModal}>+ add expense</button>
			</div>

			<div class="filter-controls">
				<select bind:value={expenseCategory}>
					<option value="all">All Categories</option>
					<option value="software">Software & Subscriptions</option>
					<option value="equipment">Equipment</option>
					<option value="marketing">Marketing & Advertising</option>
					<option value="travel">Travel & Transportation</option>
					<option value="office">Office Supplies</option>
					<option value="professional">Professional Services</option>
					<option value="other">Other</option>
				</select>
				<input
					type="text"
					class="search-input"
					bind:value={expenseSearch}
					placeholder="Search transactions..."
				/>
			</div>

			<div id="expenseBulkActions" class="bulk-actions">
				<span class="bulk-actions-text"><strong id="selectedCount">0</strong> selected</span>
				<button class="btn btn-primary" onclick={openBulkEditModal}>edit selected</button>
				<button class="btn btn-danger" onclick={bulkDeleteExpenses}>delete selected</button>
			</div>

			{#if expenseTransactions.length === 0}
				<div class="empty-state">
					<h3>No expense transactions found</h3>
					<p>
						{expenseSearch ? 'Try adjusting your search or filters.' : 'Add expenses to track spending.'}
					</p>
				</div>
			{:else}
				<table class="transaction-table">
					<thead>
						<tr>
							<th class="checkbox-cell">
								<input type="checkbox" id="selectAllExpenses" onchange={toggleSelectAll} />
							</th>
							<th>Date</th>
							<th>Name</th>
							<th>Description</th>
							<th>Category</th>
							<th>Account</th>
							<th>Amount</th>
							<th>Receipt</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each expenseTransactions as t}
							<tr data-id={t.id}>
								<td class="checkbox-cell">
									<input
										type="checkbox"
										class="expense-checkbox"
										data-id={t.id}
										onchange={updateBulkActions}
									/>
								</td>
								<td
									class="editable-cell"
									onclick={(e) => editCell(e.currentTarget as HTMLElement, t.id, 'date', 'date')}
								>
									{formatDate(t.date)}
								</td>
								<td
									class="editable-cell"
									onclick={(e) => editCell(e.currentTarget as HTMLElement, t.id, 'customName', 'text')}
								>
									{t.customName || '-'}
								</td>
								<td
									class="editable-cell"
									onclick={(e) => editCell(e.currentTarget as HTMLElement, t.id, 'description', 'text')}
								>
									{t.description}
									{#if t.notes}
										<br /><small style="color: var(--muted-text);">{t.notes}</small>
									{/if}
								</td>
								<td>
									<span
										class="category-badge cat-{t.taxCategory || 'other_tax'}"
										onclick={(e) => openCategoryPicker(t.id, e.currentTarget as HTMLElement)}
									>
										{formatTaxCategory(t.taxCategory)}
									</span>
								</td>
								<td
									class="editable-cell"
									onclick={(e) => editCell(e.currentTarget as HTMLElement, t.id, 'account', 'text')}
								>
									{t.account || '-'}
								</td>
								<td class="amount-expense">-${t.amount.toFixed(2)}</td>
								<td>
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="receipt-dropzone"
										class:has-receipt={t.receipt}
										onclick={() => (t.receipt ? viewReceipt(t.id) : openReceiptUpload(t.id))}
										ondrop={(e) => handleReceiptDrop(e, t.id)}
										ondragover={handleReceiptDragOver}
										ondragleave={handleReceiptDragLeave}
									>
										{#if t.receipt}
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											>
												<path
													d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
												></path>
											</svg>
										{:else}
											+
										{/if}
									</div>
								</td>
								<td>
									<div class="action-buttons">
										{#if typeof t.id === 'number'}
											<button class="edit-btn" onclick={() => editTransaction(t.id)} title="Edit">
												✎
											</button>
											<button class="delete-btn" onclick={() => deleteTransaction(t.id)} title="Delete">
												<svg
													width="16"
													height="16"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
												>
													<polyline points="3 6 5 6 21 6"></polyline>
													<path
														d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
													></path>
													<line x1="10" y1="11" x2="10" y2="17"></line>
													<line x1="14" y1="11" x2="14" y2="17"></line>
												</svg>
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	{/if}

	<!-- Import Tab -->
	{#if activeTab === 'import'}
		<div class="section">
			<div class="section-header">
				<h2 class="section-title">Import Bank Statement</h2>
			</div>

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="import-zone"
				id="importZone"
				onclick={() => document.getElementById('csvFileInput')?.click()}
				ondragover={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
				ondragleave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); }}
				ondrop={(e) => {
					e.preventDefault();
					e.currentTarget.classList.remove('dragover');
					const file = e.dataTransfer?.files?.[0];
					if (file && file.name.endsWith('.csv')) {
						const reader = new FileReader();
						reader.onload = (evt) => parseCSV(evt.target?.result as string);
						reader.readAsText(file);
					}
				}}
			>
				<div class="upload-icon">📄</div>
				<h3>Drop CSV file here or click to upload</h3>
				<p class="import-instructions">
					Upload a CSV file from your bank statement.<br />
					Expected format: Date, Description, Amount (negative for expenses, positive for income)
				</p>
				<input
					type="file"
					id="csvFileInput"
					class="file-input"
					accept=".csv"
					onchange={handleCSVUpload}
				/>
			</div>

			<div id="csvPreviewSection" style="display: none;">
				<div class="csv-mapping">
					<h3 style="margin-bottom: 1rem;">Map CSV Columns</h3>
					<div class="mapping-row">
						<label>CSV Column</label>
						<span></span>
						<label>Maps To</label>
					</div>
					<div class="mapping-row">
						<select id="csvDateColumn"></select>
						<span class="mapping-arrow">→</span>
						<span>Date</span>
					</div>
					<div class="mapping-row">
						<select id="csvDescColumn"></select>
						<span class="mapping-arrow">→</span>
						<span>Description</span>
					</div>
					<div class="mapping-row">
						<select id="csvAmountColumn"></select>
						<span class="mapping-arrow">→</span>
						<span>Amount</span>
					</div>
					<div style="margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: flex-end;">
						<button class="btn btn-danger" onclick={cancelImport}>cancel</button>
						<button class="btn btn-success" onclick={processCSVImport}>import transactions</button>
					</div>
				</div>

				<div class="csv-preview">
					<h4 style="margin-bottom: 1rem; color: var(--subtle-text);">Preview (first 5 rows)</h4>
					<div id="csvPreviewTable"></div>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Edit Transaction Modal -->
<div id="editModal" class="modal">
	<div class="modal-content">
		<div class="modal-header">
			<h3 class="modal-title">Edit Transaction</h3>
		</div>
		<form id="editForm" onsubmit={saveEdit}>
			<input type="hidden" id="editTransactionId" />
			<div class="form-group">
				<label for="editDate">Date</label>
				<input type="date" id="editDate" required />
			</div>
			<div class="form-group">
				<label for="editDescription">Description</label>
				<input type="text" id="editDescription" required />
			</div>
			<div class="form-group">
				<label for="editCategory">Category</label>
				<select id="editCategory" required>
					<option value="software">Software & Subscriptions</option>
					<option value="equipment">Equipment</option>
					<option value="marketing">Marketing & Advertising</option>
					<option value="travel">Travel & Transportation</option>
					<option value="office">Office Supplies</option>
					<option value="professional">Professional Services</option>
					<option value="other">Other</option>
				</select>
			</div>
			<div class="form-group">
				<label for="editAccount">Account</label>
				<input type="text" id="editAccount" required />
			</div>
			<div class="form-group">
				<label for="editTaxCategory">Tax Category</label>
				<select id="editTaxCategory" required>
					<option value="home_office">Home Office</option>
					<option value="business_meals">Business Meals (50% deductible)</option>
					<option value="vehicles">Vehicles</option>
					<option value="travel">Travel Expenses</option>
					<option value="professional_fees">Professional Fees</option>
					<option value="insurance">Insurance</option>
					<option value="advertising">Advertising & Marketing</option>
					<option value="supplies">Supplies & Equipment</option>
					<option value="startup">Start-up Costs</option>
					<option value="interest">Interest</option>
					<option value="taxes">Taxes & Licenses</option>
					<option value="depreciation">Depreciation</option>
					<option value="other_tax">Other</option>
				</select>
			</div>
			<div class="form-group">
				<label for="editAmount">Amount</label>
				<input
					type="number"
					id="editAmount"
					step="0.01"
					min="0"
					required
					readonly
					style="background: var(--bg-primary); cursor: not-allowed;"
				/>
			</div>
			<div class="form-group">
				<label for="editNotes">Notes</label>
				<textarea id="editNotes"></textarea>
			</div>
			<div class="form-actions">
				<button type="button" class="btn btn-danger" onclick={closeEditModal}>cancel</button>
				<button type="submit" class="btn btn-success">save changes</button>
			</div>
		</form>
	</div>
</div>

<!-- Bulk Edit Modal -->
<div id="bulkEditModal" class="modal">
	<div class="modal-content">
		<div class="modal-header">
			<h3 class="modal-title">Bulk Edit <span id="bulkEditCount">0</span> Transactions</h3>
		</div>
		<form id="bulkEditForm" onsubmit={saveBulkEdit}>
			<p style="margin-bottom: 1.5rem; color: var(--subtle-text);">
				Only fill in the fields you want to change. Empty fields will not be modified.
			</p>
			<div class="form-group">
				<label for="bulkCategory">Category</label>
				<select id="bulkCategory">
					<option value="">Don't change</option>
					<option value="software">Software & Subscriptions</option>
					<option value="equipment">Equipment</option>
					<option value="marketing">Marketing & Advertising</option>
					<option value="travel">Travel & Transportation</option>
					<option value="office">Office Supplies</option>
					<option value="professional">Professional Services</option>
					<option value="other">Other</option>
				</select>
			</div>
			<div class="form-group">
				<label for="bulkAccount">Account</label>
				<input type="text" id="bulkAccount" placeholder="Leave empty to keep current" />
			</div>
			<div class="form-group">
				<label for="bulkTaxCategory">Tax Category</label>
				<select id="bulkTaxCategory">
					<option value="">Don't change</option>
					<option value="home_office">Home Office</option>
					<option value="business_meals">Business Meals (50% deductible)</option>
					<option value="vehicles">Vehicles</option>
					<option value="travel">Travel Expenses</option>
					<option value="professional_fees">Professional Fees</option>
					<option value="insurance">Insurance</option>
					<option value="advertising">Advertising & Marketing</option>
					<option value="supplies">Supplies & Equipment</option>
					<option value="startup">Start-up Costs</option>
					<option value="interest">Interest</option>
					<option value="taxes">Taxes & Licenses</option>
					<option value="depreciation">Depreciation</option>
					<option value="other_tax">Other</option>
				</select>
			</div>
			<div class="form-actions">
				<button type="button" class="btn btn-danger" onclick={closeBulkEditModal}>cancel</button>
				<button type="submit" class="btn btn-success">apply changes</button>
			</div>
		</form>
	</div>
</div>

<!-- Add Expense Modal -->
<div id="expenseModal" class="modal">
	<div class="modal-content">
		<div class="modal-header">
			<h3 class="modal-title">add expense</h3>
		</div>
		<form id="expenseForm" onsubmit={addExpense}>
			<div class="form-group">
				<label for="expenseDate">Date</label>
				<input type="date" id="expenseDate" name="expenseDate" required />
			</div>
			<div class="form-group">
				<label for="expenseDescription">Description</label>
				<input
					type="text"
					id="expenseDescription"
					name="expenseDescription"
					placeholder="What was this expense for?"
					required
				/>
			</div>
			<div class="form-group">
				<label for="expenseCategory">Category</label>
				<select id="expenseCategory" name="expenseCategory" required>
					<option value="">Select a category...</option>
					<option value="software">Software & Subscriptions</option>
					<option value="equipment">Equipment</option>
					<option value="marketing">Marketing & Advertising</option>
					<option value="travel">Travel & Transportation</option>
					<option value="office">Office Supplies</option>
					<option value="professional">Professional Services</option>
					<option value="other">Other</option>
				</select>
			</div>
			<div class="form-group">
				<label for="expenseAccount">Account</label>
				<input
					type="text"
					id="expenseAccount"
					name="expenseAccount"
					placeholder="Credit card or account name"
					required
				/>
			</div>
			<div class="form-group">
				<label for="expenseTaxCategory">Tax Category</label>
				<select id="expenseTaxCategory" name="expenseTaxCategory" required>
					<option value="">Select tax category...</option>
					<option value="home_office">Home Office</option>
					<option value="business_meals">Business Meals (50% deductible)</option>
					<option value="vehicles">Vehicles</option>
					<option value="travel">Travel Expenses</option>
					<option value="professional_fees">Professional Fees</option>
					<option value="insurance">Insurance</option>
					<option value="advertising">Advertising & Marketing</option>
					<option value="supplies">Supplies & Equipment</option>
					<option value="startup">Start-up Costs</option>
					<option value="interest">Interest</option>
					<option value="taxes">Taxes & Licenses</option>
					<option value="depreciation">Depreciation</option>
					<option value="other_tax">Other</option>
				</select>
			</div>
			<div class="form-group">
				<label for="expenseAmount">Amount</label>
				<input
					type="number"
					id="expenseAmount"
					name="expenseAmount"
					step="0.01"
					min="0"
					placeholder="0.00"
					required
				/>
			</div>
			<div class="form-group">
				<label for="expenseNotes">Notes (Optional)</label>
				<textarea
					id="expenseNotes"
					name="expenseNotes"
					placeholder="Additional details..."
				></textarea>
			</div>
			<div class="form-actions">
				<button type="button" class="btn btn-danger" onclick={closeExpenseModal}>cancel</button>
				<button type="submit" class="btn btn-success">add expense</button>
			</div>
		</form>
	</div>
</div>

<style>
	:global(body) {
		overflow: auto !important;
	}

	.dashboard-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1.5rem;
		margin-bottom: 3rem;
	}

	.stat-card {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
	}

	.stat-label {
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--muted-text);
		margin-bottom: 0.5rem;
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 600;
		font-family: var(--font-display);
		margin-bottom: 0.25rem;
	}

	.stat-value.green {
		color: var(--accent-green);
	}
	.stat-value.red {
		color: var(--accent-red);
	}
	.stat-value.blue {
		color: var(--accent-teal);
	}
	.stat-value.purple {
		color: var(--accent-purple);
	}

	.stat-subtitle {
		font-size: 0.9rem;
		color: var(--subtle-text);
	}

	.section {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 2rem;
		border: var(--border-light);
		box-shadow: var(--shadow-subtle);
		margin-bottom: 2rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.section-title {
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--primary-text);
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		font-family: var(--font-body);
	}

	.btn-primary {
		background: var(--accent-teal);
		color: white;
	}
	.btn-primary:hover {
		background: #3a8bc7;
	}

	.btn-secondary {
		background: var(--subtle-text);
		color: white;
	}
	.btn-secondary:hover {
		background: var(--secondary-text);
	}

	.btn-gradient {
		background: linear-gradient(135deg, #4a90e2 0%, #e74c3c 100%);
		color: white;
		box-shadow:
			0 4px 20px rgba(0, 0, 0, 0.05),
			0 0 0 1px rgba(74, 144, 226, 0.1);
		transition: all 0.2s;
	}
	.btn-gradient:hover {
		background: linear-gradient(135deg, #3a7bc8 0%, #d43f33 100%);
		transform: translateY(-1px);
		box-shadow:
			0 6px 24px rgba(0, 0, 0, 0.08),
			0 0 0 1px rgba(74, 144, 226, 0.2);
	}

	.btn-success {
		background: var(--accent-green);
		color: white;
	}
	.btn-success:hover {
		background: #47c760;
	}

	.btn-danger {
		background: var(--accent-red);
		color: white;
	}
	.btn-danger:hover {
		background: #e65555;
	}

	.transaction-table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}

	.transaction-table th {
		background: var(--bg-primary);
		padding: 1rem;
		text-align: left;
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--subtle-text);
		border-bottom: 2px solid var(--border-medium);
	}

	.transaction-table td {
		padding: 1rem;
		border-bottom: var(--border-light);
		font-size: 0.95rem;
		color: var(--secondary-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.transaction-table td:nth-child(4) {
		white-space: normal;
	}
	.transaction-table td:nth-child(5) {
		overflow: visible;
	}
	.transaction-table td.checkbox-cell {
		overflow: visible;
		text-overflow: clip;
	}
	.transaction-table td:nth-child(8) {
		overflow: visible;
		text-overflow: clip;
	}
	.transaction-table td:last-child {
		overflow: visible;
		text-overflow: clip;
	}

	.transaction-table th:last-child,
	.transaction-table td:last-child {
		text-align: right;
	}

	.transaction-table th:nth-child(2) {
		width: 110px;
	}
	.transaction-table th:nth-child(3) {
		width: 120px;
	}
	.transaction-table th:nth-child(4) {
		width: 180px;
	}
	.transaction-table th:nth-child(5) {
		width: 180px;
	}
	.transaction-table th:nth-child(7) {
		width: 100px;
	}
	.transaction-table th:nth-child(8) {
		width: 100px;
	}

	.category-badge {
		display: inline-block;
		padding: 0.35rem 0.75rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.3px;
		cursor: pointer;
		transition: all 0.2s;
		user-select: none;
	}
	.category-badge:hover {
		opacity: 0.8;
		transform: scale(1.05);
	}

	.cat-home_office {
		background: rgba(70, 159, 224, 0.15);
		color: var(--accent-teal);
	}
	.cat-business_meals {
		background: rgba(255, 146, 43, 0.15);
		color: var(--accent-gold);
	}
	.cat-vehicles {
		background: rgba(132, 94, 194, 0.15);
		color: var(--accent-purple);
	}
	.cat-travel {
		background: rgba(81, 207, 102, 0.15);
		color: var(--accent-green);
	}
	.cat-professional_fees {
		background: rgba(0, 122, 204, 0.15);
		color: var(--accent-blue);
	}
	.cat-insurance {
		background: rgba(255, 107, 107, 0.15);
		color: var(--accent-red);
	}
	.cat-advertising {
		background: rgba(255, 146, 43, 0.15);
		color: var(--accent-gold);
	}
	.cat-supplies {
		background: rgba(70, 159, 224, 0.15);
		color: var(--accent-teal);
	}
	.cat-startup {
		background: rgba(132, 94, 194, 0.15);
		color: var(--accent-purple);
	}
	.cat-interest {
		background: rgba(255, 107, 107, 0.15);
		color: var(--accent-red);
	}
	.cat-taxes {
		background: rgba(0, 122, 204, 0.15);
		color: var(--accent-blue);
	}
	.cat-depreciation {
		background: rgba(132, 94, 194, 0.15);
		color: var(--accent-purple);
	}
	.cat-personal {
		background: rgba(136, 136, 136, 0.15);
		color: var(--muted-text);
	}
	.cat-other_tax,
	.cat-income,
	.cat-other {
		background: rgba(136, 136, 136, 0.15);
		color: var(--muted-text);
	}

	.amount-income {
		color: var(--accent-green);
		font-weight: 600;
	}

	.amount-expense {
		color: var(--accent-red);
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		justify-content: flex-end;
	}

	.edit-btn {
		background: none;
		border: none;
		color: var(--muted-text);
		cursor: pointer;
		transition: color 0.2s;
		padding: 0.5rem;
		font-size: 1rem;
	}
	.edit-btn:hover {
		color: var(--accent-teal);
	}

	.delete-btn {
		background: none;
		border: none;
		color: var(--muted-text);
		cursor: pointer;
		transition: color 0.2s;
		padding: 0.5rem;
	}
	.delete-btn:hover {
		color: var(--accent-red);
	}

	.bulk-actions {
		display: none;
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		border: var(--border-light);
		align-items: center;
		gap: 1rem;
	}
	.bulk-actions.active {
		display: flex;
	}

	.bulk-actions-text {
		font-size: 0.9rem;
		color: var(--subtle-text);
	}

	.checkbox-cell {
		width: 40px;
		text-align: center;
	}

	input[type='checkbox'] {
		cursor: pointer;
		width: 18px;
		height: 18px;
	}

	.editable-cell {
		cursor: pointer;
		position: relative;
	}
	.editable-cell:hover {
		background: rgba(70, 159, 224, 0.05);
	}
	.editable-cell input,
	.editable-cell select {
		width: 100%;
		border: 2px solid var(--accent-teal);
		background: white;
		padding: 0.5rem;
		font-size: 0.9rem;
	}
	.editable-cell input:focus,
	.editable-cell select:focus {
		outline: none;
	}

	:global(.category-picker) {
		position: absolute;
		background: white;
		border: 2px solid var(--accent-teal);
		border-radius: 8px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
		z-index: 100;
		min-width: 200px;
		max-height: 300px;
		overflow-y: auto;
	}

	:global(.category-option) {
		padding: 0.75rem 1rem;
		cursor: pointer;
		transition: background 0.2s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	:global(.category-option:hover) {
		background: var(--bg-primary);
	}
	:global(.category-option .category-badge) {
		pointer-events: none;
		margin: 0;
	}

	.receipt-dropzone {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 60px;
		height: 30px;
		border: 1px solid var(--border-medium);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 1rem;
		color: var(--muted-text);
		background: white;
	}
	.receipt-dropzone:hover {
		border-color: var(--accent-teal);
		color: var(--accent-teal);
	}
	.receipt-dropzone.has-receipt {
		border-color: var(--accent-green);
		color: var(--accent-green);
	}
	.receipt-dropzone.dragover {
		border-color: var(--accent-teal);
		background: rgba(70, 159, 224, 0.05);
	}

	:global(.modal) {
		display: none;
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		z-index: 1000;
	}

	:global(.modal.active) {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.modal-content) {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 2rem;
		max-width: 500px;
		width: 90%;
		max-height: 90vh;
		overflow-y: auto;
	}

	:global(.modal-header) {
		margin-bottom: 1.5rem;
	}

	:global(.modal-title) {
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--primary-text);
	}

	.form-group {
		margin-bottom: 1rem;
	}

	label {
		display: block;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--secondary-text);
		margin-bottom: 0.5rem;
	}

	input,
	select,
	textarea {
		width: 100%;
		padding: 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.95rem;
		font-family: var(--font-body);
		background: white;
	}

	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	textarea {
		resize: vertical;
		min-height: 80px;
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

	.empty-state {
		text-align: center;
		padding: 3rem;
		color: var(--muted-text);
	}
	.empty-state h3 {
		margin-bottom: 0.5rem;
		color: var(--subtle-text);
	}

	.filter-controls {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.filter-controls select {
		width: auto;
		min-width: 150px;
	}

	.search-input {
		padding: 0.5rem 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.95rem;
		font-family: var(--font-body);
		background: white;
		min-width: 250px;
	}
	.search-input:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	.tab-nav {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 2rem;
		border-bottom: 2px solid var(--border-light);
	}

	.tab-btn {
		background: none;
		border: none;
		padding: 1rem 1.5rem;
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--muted-text);
		cursor: pointer;
		transition: all 0.2s;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		font-family: var(--font-body);
	}

	.tab-btn:hover {
		color: var(--secondary-text);
	}

	.tab-btn.active {
		color: var(--accent-teal);
		border-bottom-color: var(--accent-teal);
	}

	.date-range-controls {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.date-range-controls input[type='date'] {
		padding: 0.5rem 0.75rem;
		border: var(--border-medium);
		border-radius: 6px;
		font-size: 0.95rem;
		font-family: var(--font-body);
		background: white;
	}

	.date-range-controls input:focus {
		outline: none;
		border-color: var(--accent-teal);
	}

	.import-zone {
		border: 2px dashed var(--border-medium);
		border-radius: var(--radius-lg);
		padding: 3rem 2rem;
		text-align: center;
		background: var(--bg-primary);
		margin-bottom: 1.5rem;
		transition: all 0.3s;
		cursor: pointer;
	}

	.import-zone:hover {
		border-color: var(--accent-teal);
		background: var(--bg-white);
	}

	.import-zone.dragover {
		border-color: var(--accent-teal);
		background: var(--bg-white);
	}

	.file-input {
		display: none;
	}

	.upload-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
		color: var(--muted-text);
	}

	.import-instructions {
		margin-top: 1rem;
		font-size: 0.9rem;
		color: var(--subtle-text);
	}

	.csv-preview {
		max-height: 400px;
		overflow-y: auto;
		margin-top: 1rem;
	}

	.csv-mapping {
		background: var(--bg-white);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		margin-top: 1rem;
	}

	.mapping-row {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1rem;
	}

	.mapping-arrow {
		color: var(--muted-text);
	}

	@media (max-width: 768px) {
		.stats-grid {
			grid-template-columns: 1fr;
		}
		.section-header {
			flex-direction: column;
			gap: 1rem;
			align-items: stretch;
		}
		.transaction-table {
			font-size: 0.85rem;
		}
		.transaction-table th,
		.transaction-table td {
			padding: 0.75rem 0.5rem;
		}
		.filter-controls {
			flex-direction: column;
		}
		.filter-controls select {
			width: 100%;
		}
	}
</style>
