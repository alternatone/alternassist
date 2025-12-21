const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Load session secret from file or environment
let sessionSecret;
try {
  sessionSecret = fs.readFileSync(path.join(__dirname, '.session-secret'), 'utf8').trim();
} catch (e) {
  console.warn('WARNING: .session-secret file not found, using environment variable');
  sessionSecret = process.env.SESSION_SECRET || 'INSECURE-FALLBACK-' + Math.random();
  if (!process.env.SESSION_SECRET) {
    console.error('CRITICAL: No secure session secret configured!');
  }
}

// Configuration for alternaview within Electron
const config = {
  port: 3000,
  storagePath: path.join(require('os').homedir(), 'alternaview-storage'),
  sessionSecret: sessionSecret,
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

  // Trust Cloudflare proxy
  app.set('trust proxy', 1);

  // Create storage directory if it doesn't exist
  if (!fs.existsSync(config.storagePath)) {
    fs.mkdirSync(config.storagePath, { recursive: true });
    console.log(`Created storage directory: ${config.storagePath}`);
  }

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // HTTPS redirect (for direct non-Cloudflare access in production)
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });

  // Session middleware with enhanced security
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: config.sessionMaxAge,
      httpOnly: true,
      secure: true,  // HTTPS only
      sameSite: 'strict',
      path: '/'
    }
  }));

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requests per window (increased for admin use)
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per 15 minutes (increased for testing)
    skipSuccessfulRequests: true,
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  });

  // CORS whitelist
  const allowedOrigins = [
    'https://alternassist.alternatone.com',
    'http://localhost:3000',  // Development only
  ];

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    next();
  });

  // Special CORS headers for tus uploads only
  app.use('/api/upload', (req, res, next) => {
    res.setHeader('Access-Control-Expose-Headers', 'Upload-Offset, Location, Upload-Length, Tus-Version, Tus-Resumable, Tus-Max-Size, Tus-Extension, Upload-Metadata, Upload-Defer-Length, Upload-Concat');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Upload-Length, Upload-Offset, Tus-Resumable, Upload-Metadata, Upload-Concat, Location, Cookie');
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

  // Serve static files from public directory with no-cache headers for development
  app.use('/media', express.static(path.join(__dirname, 'public'), {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  }));

  // Serve client portal at /client
  app.use('/client', express.static(path.join(__dirname, 'client-portal'), {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  }));

  // Apply rate limiting to API routes
  app.use('/api/', apiLimiter);

  // API Routes
  app.use('/api/admin', loginLimiter, require('./server/routes/admin'));
  app.use('/api/projects', require('./server/routes/projects'));
  app.use('/api/files', require('./server/routes/files'));
  app.use('/api/upload', require('./server/routes/upload'));
  app.use('/api/estimates', require('./server/routes/estimates'));
  app.use('/api/cues', require('./server/routes/cues'));
  app.use('/api/invoices', require('./server/routes/invoices'));
  app.use('/api/payments', require('./server/routes/payments'));
  app.use('/api/accounting', require('./server/routes/accounting'));
  app.use('/api/hours-log', require('./server/routes/hours-log'));
  app.use('/api/ftp', require('./server/routes/ftp-browser'));

  // Download links (both /api/downloads and /dl routes)
  const downloadsRouter = require('./server/routes/downloads');
  app.use('/api/downloads', downloadsRouter);
  app.use('/dl', downloadsRouter);

  // Root redirect to admin login
  app.get('/', (req, res) => {
    res.redirect('/media/admin-login.html');
  });

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

    // Default error response (only if headers not already sent)
    if (!res.headersSent) {
      return res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
      });
    }
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
    try {
      serverInstance.close(() => {
        // Silently stop - don't log as stdout may be closed
        serverInstance = null;
      });
    } catch (err) {
      // Ignore errors during shutdown
      serverInstance = null;
    }
  }
}

module.exports = {
  startServer,
  stopServer,
  config
};
