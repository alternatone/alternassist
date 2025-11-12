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

      // Transform API format to Kanban format
      this.projects = apiProjects.map(p => {
        // Try to parse notes as JSON scope data
        let scopeData = {};
        let contactEmail = '';
        let notes = p.notes || '';

        try {
          const parsed = JSON.parse(p.notes);
          if (parsed && typeof parsed === 'object') {
            scopeData = parsed;
            contactEmail = parsed.contactEmail || '';
            // Don't show raw JSON as notes for prospects
            notes = '';
          }
        } catch (e) {
          // Not JSON, use as regular notes
          notes = p.notes || '';
        }

        return {
          id: p.id.toString(),
          title: p.name,
          client: p.client_name || '',
          contactEmail: contactEmail,
          status: notes, // Use parsed notes or empty for scope data
          notes: p.notes || '', // Keep original for saving back
          column: this.statusToColumn(p.status),
          pinned: Boolean(p.pinned),
          scopeData: scopeData,
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
