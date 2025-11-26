/**
 * Kanban API Adapter
 * Provides localStorage-like interface but uses SQLite API backend
 * This allows minimal changes to existing Kanban board code
 */

class KanbanAPIAdapter {
  constructor() {
    this.projects = [];
    this.loaded = false;
    this.dirtyProjects = new Set(); // Track which projects have changed
  }

  /**
   * Initialize and load projects from API
   */
  async init() {
    await this.loadProjects();
    this.loaded = true;
  }

  /**
   * Load all projects from API (OPTIMIZED: single query with scope data)
   */
  async loadProjects() {
    try {
      // Single optimized query with JOIN - eliminates N+1
      const response = await fetch('/api/projects/with-scope');
      if (!response.ok) throw new Error('Failed to load projects');

      const apiProjects = await response.json();

      // Transform API format to Kanban format
      this.projects = apiProjects.map(p => {
        const scope = {
          contact_email: p.contact_email || '',
          music_minutes: p.music_minutes || 0,
          dialogue_hours: p.dialogue_hours || 0,
          sound_design_hours: p.sound_design_hours || 0,
          mix_hours: p.mix_hours || 0,
          revision_hours: p.revision_hours || 0
        };

        // Check if notes contains JSON scope data - if so, don't use it as status text
        let statusText = '';
        let notesField = p.notes || '';
        try {
          const parsed = JSON.parse(p.notes);
          // If it's JSON with scope fields, don't use it as status text
          if (!(parsed.musicMinutes !== undefined || parsed.dialogueHours !== undefined ||
                parsed.soundDesignHours !== undefined || parsed.mixHours !== undefined)) {
            // It's JSON but not scope data, use it as status
            statusText = p.notes;
          }
        } catch (e) {
          // Not JSON, use as regular status text
          statusText = p.notes || '';
        }

        return {
          id: p.id.toString(),
          title: p.name,
          client: p.client_name || '',
          contactEmail: scope.contact_email || '',
          status: statusText,
          notes: notesField,
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
   * Mark a project as dirty (changed)
   */
  markDirty(projectId) {
    this.dirtyProjects.add(projectId.toString());
  }

  /**
   * Save projects back to API (OPTIMIZED: only saves changed projects in parallel)
   */
  async saveProjects(projects) {
    this.projects = projects;

    // Only save projects that have changed
    const toSave = projects.filter(p => this.dirtyProjects.has(p.id.toString()));

    if (toSave.length === 0) {
      return; // Nothing to save
    }

    // Save all changed projects in parallel (not sequential!)
    await Promise.all(toSave.map(async (project) => {
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
          const response = await fetch('/api/projects', {
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
          await fetch(`/api/projects/${project.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiData)
          });
        }
      } catch (error) {
        console.error(`Error saving project ${project.title}:`, error);
      }
    }));

    // Clear dirty tracking after successful save
    this.dirtyProjects.clear();
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId) {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
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
