const { shareLinkQueries, logQueries } = require('../models/database');

/**
 * Unified authentication middleware for project access
 * Supports 4 authentication methods:
 * 1. Admin session (full access)
 * 2. Client session (web portal)
 * 3. URL parameter (Electron app)
 * 4. Token (share links)
 */
function authenticateProjectAccess(req, res, next) {
  // Priority: Admin > Session > URL Param > Token

  // 1. Admin bypass - full access to all projects
  if (req.session && req.session.isAdmin) {
    req.projectId = null; // null = access to all projects
    req.isAdmin = true;
    return next();
  }

  // 2. Session auth (Web portal)
  if (req.session && req.session.projectId) {
    req.projectId = req.session.projectId;
    req.isAdmin = false;
    return next();
  }

  // 3. URL parameter auth (Electron app)
  if (req.params.projectId) {
    req.projectId = parseInt(req.params.projectId);
    req.isAdmin = false;
    return next();
  }

  // 4. Token auth (Share links)
  if (req.query.token) {
    try {
      const shareLink = shareLinkQueries.findByToken.get(req.query.token);

      if (shareLink && shareLink.expires_at > Date.now()) {
        req.projectId = shareLink.project_id;
        req.fileId = shareLink.file_id || null;
        req.isShareLink = true;
        req.isAdmin = false;

        // Log share link access
        logQueries.create.run(
          shareLink.project_id,
          shareLink.file_id || null,
          'share_link_access',
          req.ip || 'unknown'
        );

        return next();
      }
    } catch (error) {
      console.error('Token validation error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // No valid authentication method found
  return res.status(401).json({ error: 'Authentication required' });
}

/**
 * Require admin access for sensitive operations
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  req.isAdmin = true;
  next();
}

/**
 * Require authentication (any method) but not necessarily admin
 */
function requireAuth(req, res, next) {
  const hasAuth = (req.session && req.session.projectId) ||
                  (req.session && req.session.isAdmin) ||
                  req.query.token;

  if (!hasAuth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  next();
}

module.exports = {
  authenticateProjectAccess,
  requireAdmin,
  requireAuth
};
