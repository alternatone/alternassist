const { logQueries } = require('../models/database');

/**
 * Activity Tracker Service
 * Provides centralized activity logging for audit trail and analytics
 */
class ActivityTracker {
  /**
   * Log an activity event
   * @param {string} action - The action being performed (e.g., 'file_download', 'comment_added')
   * @param {object} data - Event data including projectId, fileId, metadata
   * @param {object} req - Express request object for IP address
   */
  static log(action, data, req) {
    try {
      const { projectId, fileId, metadata } = data;

      logQueries.create.run(
        projectId || null,
        fileId || null,
        action,
        req.ip || req.connection?.remoteAddress || 'unknown'
      );

      // Optional: Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Activity] ${action}:`, {
          projectId,
          fileId,
          ip: req.ip,
          ...metadata
        });
      }

      // Optional: Send to external analytics service
      if (process.env.ANALYTICS_ENABLED === 'true') {
        // Example: analyticsClient.track({ event: action, properties: { projectId, fileId, ...metadata } });
      }
    } catch (error) {
      // Don't let logging errors break the main application flow
      console.error('Activity tracking failed:', error);
    }
  }

  /**
   * Get recent activity for a project
   * @param {number} projectId - The project ID
   * @param {number} limit - Maximum number of records to return
   * @returns {Array} Array of activity log entries
   */
  static getProjectActivity(projectId, limit = 100) {
    try {
      return logQueries.getRecentByProject.all(projectId, limit);
    } catch (error) {
      console.error('Failed to get project activity:', error);
      return [];
    }
  }

  /**
   * Get recent activity for a file
   * @param {number} fileId - The file ID
   * @param {number} limit - Maximum number of records to return
   * @returns {Array} Array of activity log entries
   */
  static getFileActivity(fileId, limit = 50) {
    try {
      return logQueries.getRecentByFile.all(fileId, limit);
    } catch (error) {
      console.error('Failed to get file activity:', error);
      return [];
    }
  }
}

module.exports = ActivityTracker;
