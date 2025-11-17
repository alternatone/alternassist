/**
 * API Helper Functions
 * Centralized API calls for all pages to use
 */

const API_BASE = 'http://localhost:3000/api';

// ============================================
// ERROR HANDLING
// ============================================
class APIError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.details = details;
  }
}

// Centralized API caller
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      let errorDetails;
      try {
        errorDetails = await response.json();
      } catch (e) {
        errorDetails = { error: response.statusText };
      }
      throw new APIError(
        errorDetails.error || `Request failed: ${response.status}`,
        response.status,
        errorDetails
      );
    }

    return response.json();
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    // Network error or server not responding
    throw new APIError(
      'Cannot connect to server. Make sure the app is running.',
      0,
      { originalError: error.message }
    );
  }
}

// ============================================
// PROJECTS API
// ============================================
const ProjectsAPI = {
  getAll: () => apiCall('/projects'),
  getById: (id) => apiCall(`/projects/${id}`),
  create: (data) => apiCall('/projects', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => apiCall(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  async delete(id) {
    // First try without confirm to get warning
    try {
      return await apiCall(`/projects/${id}`, { method: 'DELETE' });
    } catch (error) {
      if (error.status === 409 && error.details.warning) {
        // Show confirmation dialog
        const relatedData = error.details.relatedData;
        const items = Object.entries(relatedData)
          .filter(([_, count]) => count > 0)
          .map(([type, count]) => `${count} ${type}`)
          .join(', ');

        const message = `This will permanently delete:\n\n${items}\n\nThis cannot be undone. Continue?`;

        if (confirm(message)) {
          // Retry with confirm flag
          return await apiCall(`/projects/${id}?confirm=true`, { method: 'DELETE' });
        } else {
          throw new Error('Delete cancelled by user');
        }
      }
      throw error;
    }
  }
};

// ============================================
// CUES API
// ============================================
const CuesAPI = {
  getAll: () => apiCall('/cues'),
  getByProject: (projectId) => apiCall(`/cues/project/${projectId}`),
  create: (data) => apiCall('/cues', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => apiCall(`/cues/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiCall(`/cues/${id}`, { method: 'DELETE' }),
  deleteByProject: (projectId) => apiCall(`/cues/project/${projectId}`, { method: 'DELETE' })
};

// ============================================
// ESTIMATES API
// ============================================
const EstimatesAPI = {
  getAll: () => apiCall('/estimates'),
  getByProject: (projectId) => apiCall(`/estimates/project/${projectId}`),
  create: (data) => apiCall('/estimates', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiCall(`/estimates/${id}`, { method: 'DELETE' })
};

// ============================================
// SCOPE API
// ============================================
const ScopeAPI = {
  get: (projectId) => apiCall(`/estimates/scope/${projectId}`),
  upsert: (data) => apiCall('/estimates/scope', {
    method: 'POST',
    body: JSON.stringify(data)
  })
};

// ============================================
// INVOICES API
// ============================================
const InvoicesAPI = {
  getAll: () => apiCall('/invoices'),
  getById: (id) => apiCall(`/invoices/${id}`),
  getByProject: (projectId) => apiCall(`/invoices/project/${projectId}`),
  create: (data) => apiCall('/invoices', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  update: (id, data) => apiCall(`/invoices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  async delete(id) {
    // First try without confirm to get warning
    try {
      return await apiCall(`/invoices/${id}`, { method: 'DELETE' });
    } catch (error) {
      if (error.status === 409 && error.details.warning) {
        // Show confirmation dialog
        const message = error.details.message || 'This invoice has related data that will be deleted. Continue?';

        if (confirm(message)) {
          // Retry with confirm flag
          return await apiCall(`/invoices/${id}?confirm=true`, { method: 'DELETE' });
        } else {
          throw new Error('Delete cancelled by user');
        }
      }
      throw error;
    }
  }
};

// ============================================
// PAYMENTS API
// ============================================
const PaymentsAPI = {
  getAll: () => apiCall('/payments'),
  getByProject: (projectId) => apiCall(`/payments/project/${projectId}`),
  getByInvoice: (invoiceId) => apiCall(`/payments/invoice/${invoiceId}`),
  create: (data) => apiCall('/payments', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiCall(`/payments/${id}`, { method: 'DELETE' })
};

// ============================================
// HELPER: Get projects with music scope
// ============================================
async function getProjectsWithMusic() {
  const projects = await ProjectsAPI.getAll();
  const projectsWithMusic = [];

  for (const project of projects) {
    try {
      const scope = await ScopeAPI.get(project.id);
      if (scope && scope.music_minutes > 0) {
        projectsWithMusic.push({
          id: project.id,
          name: project.name,
          client: project.client_name || '',
          musicMinutes: scope.music_minutes
        });
      }
    } catch (e) {
      // No scope data, skip
    }
  }

  return projectsWithMusic;
}

// ============================================
// ACCOUNTING API
// ============================================
const AccountingAPI = {
  getAll: () => apiCall('/accounting'),
  getByProject: (projectId) => apiCall(`/accounting/project/${projectId}`),
  create: (data) => apiCall('/accounting', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  delete: (id) => apiCall(`/accounting/${id}`, { method: 'DELETE' })
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.APIError = APIError;
  window.ProjectsAPI = ProjectsAPI;
  window.CuesAPI = CuesAPI;
  window.EstimatesAPI = EstimatesAPI;
  window.ScopeAPI = ScopeAPI;
  window.InvoicesAPI = InvoicesAPI;
  window.PaymentsAPI = PaymentsAPI;
  window.AccountingAPI = AccountingAPI;
  window.getProjectsWithMusic = getProjectsWithMusic;
}
