/**
 * API Helper Functions
 * Centralized API calls for all pages to use
 */

const API_BASE = 'http://localhost:3000/api';

// ============================================
// PROJECTS API
// ============================================
const ProjectsAPI = {
  async getAll() {
    const response = await fetch(`${API_BASE}/projects`);
    if (!response.ok) throw new Error('Failed to fetch projects');
    return response.json();
  },

  async getById(id) {
    const response = await fetch(`${API_BASE}/projects/${id}`);
    if (!response.ok) throw new Error('Failed to fetch project');
    return response.json();
  },

  async create(projectData) {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData)
    });
    if (!response.ok) throw new Error('Failed to create project');
    return response.json();
  },

  async update(id, projectData) {
    const response = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData)
    });
    if (!response.ok) throw new Error('Failed to update project');
    return response.json();
  },

  async delete(id) {
    const response = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete project');
    return response.json();
  }
};

// ============================================
// CUES API
// ============================================
const CuesAPI = {
  async getAll() {
    const response = await fetch(`${API_BASE}/cues`);
    if (!response.ok) throw new Error('Failed to fetch cues');
    return response.json();
  },

  async getByProject(projectId) {
    const response = await fetch(`${API_BASE}/cues/project/${projectId}`);
    if (!response.ok) throw new Error('Failed to fetch cues for project');
    return response.json();
  },

  async create(cueData) {
    const response = await fetch(`${API_BASE}/cues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cueData)
    });
    if (!response.ok) throw new Error('Failed to create cue');
    return response.json();
  },

  async update(id, cueData) {
    const response = await fetch(`${API_BASE}/cues/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cueData)
    });
    if (!response.ok) throw new Error('Failed to update cue');
    return response.json();
  },

  async delete(id) {
    const response = await fetch(`${API_BASE}/cues/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete cue');
    return response.json();
  },

  async deleteByProject(projectId) {
    const response = await fetch(`${API_BASE}/cues/project/${projectId}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete project cues');
    return response.json();
  }
};

// ============================================
// ESTIMATES API
// ============================================
const EstimatesAPI = {
  async getAll() {
    const response = await fetch(`${API_BASE}/estimates`);
    if (!response.ok) throw new Error('Failed to fetch estimates');
    return response.json();
  },

  async getByProject(projectId) {
    const response = await fetch(`${API_BASE}/estimates/project/${projectId}`);
    if (!response.ok) throw new Error('Failed to fetch estimates for project');
    return response.json();
  },

  async create(estimateData) {
    const response = await fetch(`${API_BASE}/estimates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(estimateData)
    });
    if (!response.ok) throw new Error('Failed to create estimate');
    return response.json();
  },

  async delete(id) {
    const response = await fetch(`${API_BASE}/estimates/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete estimate');
    return response.json();
  }
};

// ============================================
// SCOPE API
// ============================================
const ScopeAPI = {
  async get(projectId) {
    const response = await fetch(`${API_BASE}/estimates/scope/${projectId}`);
    if (!response.ok) throw new Error('Failed to fetch scope');
    return response.json();
  },

  async upsert(scopeData) {
    const response = await fetch(`${API_BASE}/estimates/scope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scopeData)
    });
    if (!response.ok) throw new Error('Failed to save scope');
    return response.json();
  }
};

// ============================================
// INVOICES API
// ============================================
const InvoicesAPI = {
  async getAll() {
    const response = await fetch(`${API_BASE}/invoices`);
    if (!response.ok) throw new Error('Failed to fetch invoices');
    return response.json();
  },

  async getAllWithProjects(limit = 50) {
    const response = await fetch(`${API_BASE}/invoices/with-projects?limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch invoices with projects');
    return response.json();
  },

  async getNextNumber() {
    const response = await fetch(`${API_BASE}/invoices/next-number`);
    if (!response.ok) throw new Error('Failed to fetch next invoice number');
    return response.json();
  },

  async getById(id) {
    const response = await fetch(`${API_BASE}/invoices/${id}`);
    if (!response.ok) throw new Error('Failed to fetch invoice');
    return response.json();
  },

  async getWithProject(id) {
    const response = await fetch(`${API_BASE}/invoices/${id}/with-project`);
    if (!response.ok) throw new Error('Failed to fetch invoice with project');
    return response.json();
  },

  async getByProject(projectId) {
    const response = await fetch(`${API_BASE}/invoices/project/${projectId}`);
    if (!response.ok) throw new Error('Failed to fetch invoices for project');
    return response.json();
  },

  async create(invoiceData) {
    const response = await fetch(`${API_BASE}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    });
    if (!response.ok) throw new Error('Failed to create invoice');
    return response.json();
  },

  async createWithPayment(data) {
    const response = await fetch(`${API_BASE}/invoices/with-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create invoice with payment');
    }
    return response.json();
  },

  async update(id, invoiceData) {
    const response = await fetch(`${API_BASE}/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    });
    if (!response.ok) throw new Error('Failed to update invoice');
    return response.json();
  },

  async delete(id) {
    const response = await fetch(`${API_BASE}/invoices/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete invoice');
    return response.json();
  }
};

// ============================================
// PAYMENTS API
// ============================================
const PaymentsAPI = {
  async getAll() {
    const response = await fetch(`${API_BASE}/payments`);
    if (!response.ok) throw new Error('Failed to fetch payments');
    return response.json();
  },

  async getByProject(projectId) {
    const response = await fetch(`${API_BASE}/payments/project/${projectId}`);
    if (!response.ok) throw new Error('Failed to fetch payments for project');
    return response.json();
  },

  async getByInvoice(invoiceId) {
    const response = await fetch(`${API_BASE}/payments/invoice/${invoiceId}`);
    if (!response.ok) throw new Error('Failed to fetch payments for invoice');
    return response.json();
  },

  async create(paymentData) {
    const response = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData)
    });
    if (!response.ok) throw new Error('Failed to create payment');
    return response.json();
  },

  async delete(id) {
    const response = await fetch(`${API_BASE}/payments/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete payment');
    return response.json();
  }
};

// ============================================
// HELPER: Get projects with music scope
// ============================================
async function getProjectsWithMusic() {
  const projects = await ProjectsAPI.getAll();
  const projectsWithMusic = [];

  for (const project of projects) {
    // Check if project has music coverage in the main projects table first
    if (project.music_coverage && project.music_coverage > 0) {
      projectsWithMusic.push({
        id: project.id,
        name: project.name,
        client: project.client_name || '',
        musicMinutes: project.music_coverage
      });
      continue;
    }

    // Fallback: Check old project_scope table for legacy projects
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

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.ProjectsAPI = ProjectsAPI;
  window.CuesAPI = CuesAPI;
  window.EstimatesAPI = EstimatesAPI;
  window.ScopeAPI = ScopeAPI;
  window.InvoicesAPI = InvoicesAPI;
  window.PaymentsAPI = PaymentsAPI;
  window.AccountingAPI = AccountingAPI;
  window.getProjectsWithMusic = getProjectsWithMusic;
}
