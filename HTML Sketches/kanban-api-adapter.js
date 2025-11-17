/**
 * Kanban API Adapter
 * Provides localStorage-like interface but uses SQLite API backend
 * This allows minimal changes to existing Kanban board code
 */

class KanbanAPIAdapter {
  constructor() {
    this.projects = [];
    this.loaded = false;
  }

  /**
   * Initialize and load projects from API
   */
  async init() {
    await this.loadProjects();
    this.loaded = true;
  }

  /**
   * Load all projects from API
   */
  async loadProjects() {
    try {
      const response = await fetch('http://localhost:3000/api/projects');
      if (!response.ok) throw new Error('Failed to load projects');

      const apiProjects = await response.json();

      // Fetch all project scopes
      const scopePromises = apiProjects.map(async (p) => {
        try {
          const scopeResponse = await fetch(`http://localhost:3000/api/estimates/scope/${p.id}`);
          if (scopeResponse.ok) {
            return { projectId: p.id, scope: await scopeResponse.json() };
          }
        } catch (e) {
          console.error(`Failed to fetch scope for project ${p.id}:`, e);
        }
        return { projectId: p.id, scope: null };
      });

      const scopesData = await Promise.all(scopePromises);
      const scopeMap = {};
      scopesData.forEach(({ projectId, scope }) => {
        scopeMap[projectId] = scope;
      });

      // Transform API format to Kanban format
      this.projects = apiProjects.map(p => {
        const scope = scopeMap[p.id] || {};

        return {
          id: p.id.toString(),
          title: p.name,
          client: p.client_name || '',
          contactEmail: scope.contact_email || '',
          status: p.notes || '', // Use notes field for status text
          notes: p.notes || '',
          column: this.statusToColumn(p.status),
          pinned: Boolean(p.pinned),
          scopeData: scope,
          loggedHours: {} // Not used yet
        };
      });

      return this.projects;
    } catch (error) {
      console.error('Error loading projects:', error);
      return [];
    }
  }

  /**
   * Save all projects back to API
   */
  async saveProjects(projects) {
    this.projects = projects;

    // Update each project individually
    // In a production app, we'd batch these or use optimistic updates
    for (const project of projects) {
      try {
        const apiData = {
          name: project.title,
          client_name: project.client,
          status: this.columnToStatus(project.column),
          notes: project.notes,
          pinned: project.pinned ? 1 : 0
        };

        if (typeof project.id === 'string' && project.id.length > 10) {
          // This is a temporary ID from Date.now() - create new project
          const response = await fetch('http://localhost:3000/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...apiData,
              password: 'default' // Required by DB schema
            })
          });

          if (response.ok) {
            const data = await response.json();
            project.id = data.id.toString(); // Update with real DB ID
          }
        } else {
          // Update existing project
          await fetch(`http://localhost:3000/api/projects/${project.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiData)
          });
        }
      } catch (error) {
        console.error(`Error saving project ${project.title}:`, error);
      }
    }
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId) {
    try {
      const response = await fetch(`http://localhost:3000/api/projects/${projectId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        this.projects = this.projects.filter(p => p.id !== projectId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting project:', error);
      return false;
    }
  }

  /**
   * Map Kanban column to DB status
   */
  columnToStatus(column) {
    const mapping = {
      'prospects': 'prospects',
      'in-process': 'active',
      'in-review': 'active',
      'approved-billed': 'completed',
      'archive': 'completed'
    };
    return mapping[column] || 'prospects';
  }

  /**
   * Map DB status to Kanban column
   */
  statusToColumn(status) {
    const mapping = {
      'prospects': 'prospects',
      'active': 'in-process',
      'hold': 'in-review',
      'completed': 'approved-billed'
    };
    return mapping[status] || 'prospects';
  }

  /**
   * Get projects (returns cached copy)
   */
  getProjects() {
    return this.projects;
  }

  /**
   * Check if loaded
   */
  isLoaded() {
    return this.loaded;
  }
}

// Create global instance
window.kanbanAPI = new KanbanAPIAdapter();
