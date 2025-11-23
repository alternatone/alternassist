/**
 * Response Helper Middleware
 *
 * Adds convenience methods to Express response object for consistent API responses.
 * Phase 1 optimization: Reduces boilerplate and ensures consistent response format.
 */

module.exports = (req, res, next) => {
  // Success response (200)
  res.success = (data) => res.json({ success: true, ...data });

  // Created response (201)
  res.created = (data) => res.status(201).json(data);

  // Error response (customizable status)
  res.error = (message, status = 400) => res.status(status).json({ error: message });

  // Not found (404)
  res.notFound = (message = 'Resource not found') => res.status(404).json({ error: message });

  // Unauthorized (401)
  res.unauthorized = (message = 'Not authenticated') => res.status(401).json({ error: message });

  // Forbidden (403)
  res.forbidden = (message = 'Access denied') => res.status(403).json({ error: message });

  next();
};
