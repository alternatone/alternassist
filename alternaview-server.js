const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Configuration for alternaview within Electron
const config = {
  port: 3000,
  storagePath: path.join(require('os').homedir(), 'alternaview-storage'),
  sessionSecret: 'your-secret-key-' + Math.random(),
  sessionMaxAge: 24 * 60 * 60 * 1000, // 24 hours
  maxFileSize: 64 * 1024 * 1024 * 1024 // 64GB
};

let serverInstance = null;

function startServer() {
  if (serverInstance) {
    console.log('Alternaview server already running');
    return serverInstance;
  }

  const app = express();

  // Create storage directory if it doesn't exist
  if (!fs.existsSync(config.storagePath)) {
    fs.mkdirSync(config.storagePath, { recursive: true });
    console.log(`Created storage directory: ${config.storagePath}`);
  }

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session middleware
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: config.sessionMaxAge,
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/'
    }
  }));

  // CORS headers for tus uploads
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Upload-Length, Upload-Offset, Tus-Resumable, Upload-Metadata, Upload-Concat, Location, Cookie');
    res.header('Access-Control-Expose-Headers', 'Upload-Offset, Location, Upload-Length, Tus-Version, Tus-Resumable, Tus-Max-Size, Tus-Extension, Upload-Metadata, Upload-Defer-Length, Upload-Concat');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Response helpers (Phase 1 optimization)
  app.use(require('./server/utils/response-helpers'));

  // Disable caching for HTML files
  app.use('/media', (req, res, next) => {
    if (req.path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // Serve static files from public directory
  app.use('/media', express.static(path.join(__dirname, 'public')));

  // Serve client portal at /client
  app.use('/client', express.static(path.join(__dirname, 'client-portal')));

  // API Routes
  app.use('/api/projects', require('./server/routes/projects'));
  app.use('/api/files', require('./server/routes/files'));
  app.use('/api/upload', require('./server/routes/upload'));
  app.use('/api/estimates', require('./server/routes/estimates'));
  app.use('/api/cues', require('./server/routes/cues'));
  app.use('/api/invoices', require('./server/routes/invoices'));
  app.use('/api/payments', require('./server/routes/payments'));
  app.use('/api/accounting', require('./server/routes/accounting'));
  app.use('/api/hours-log', require('./server/routes/hours-log'));

  // Centralized error handling middleware (Phase 2 optimization)
  app.use((err, req, res, next) => {
    console.error('Error:', err.message);

    // Handle multer file upload errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files' });
    }

    // Handle SQLite constraint errors
    if (err.code === 'SQLITE_CONSTRAINT' || err.message?.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Duplicate or invalid data' });
    }
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return res.status(400).json({ error: 'Referenced project or resource not found' });
    }

    // Handle authentication errors
    if (err.message === 'Not authenticated') {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Default error response
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error'
    });
  });

  // Start server
  serverInstance = app.listen(config.port, () => {
    console.log(`Alternaview server running on http://localhost:${config.port}`);
  });

  serverInstance.on('error', (err) => {
    console.error('Server error:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use`);
    }
  });

  return serverInstance;
}

function stopServer() {
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('Alternaview server stopped');
      serverInstance = null;
    });
  }
}

module.exports = {
  startServer,
  stopServer,
  config
};
