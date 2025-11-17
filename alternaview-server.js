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
let startupAttempts = 0;
const MAX_STARTUP_ATTEMPTS = 3;

function startServer() {
  if (serverInstance) {
    console.log('Alternaview server already running');
    return Promise.resolve(serverInstance);
  }

  return new Promise((resolve, reject) => {
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
      secure: false
    }
  }));

  // Serve static files from HTML Sketches directory
  app.use('/media', express.static(path.join(__dirname, 'HTML Sketches')));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/projects', require('./server/routes/projects'));
  app.use('/api/files', require('./server/routes/files'));
  app.use('/api/estimates', require('./server/routes/estimates'));
  app.use('/api/cues', require('./server/routes/cues'));
  app.use('/api/invoices', require('./server/routes/invoices'));
  app.use('/api/payments', require('./server/routes/payments'));
  app.use('/api/accounting', require('./server/routes/accounting'));

    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error('Alternaview Error:', err);
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
      });
    });

    // Start server with error handling
    try {
      serverInstance = app.listen(config.port, () => {
        console.log(`Alternaview server running on http://localhost:${config.port}`);
        startupAttempts = 0;
        resolve(serverInstance);
      });

      serverInstance.on('error', (err) => {
        console.error('Server error:', err);

        if (err.code === 'EADDRINUSE') {
          console.error(`Port ${config.port} is already in use`);

          if (startupAttempts < MAX_STARTUP_ATTEMPTS) {
            startupAttempts++;
            // Try different port
            config.port = config.port + 1;
            console.log(`Retrying on port ${config.port}...`);
            serverInstance = null;
            setTimeout(() => {
              startServer().then(resolve).catch(reject);
            }, 1000);
          } else {
            reject(new Error(`Failed to start server after ${MAX_STARTUP_ATTEMPTS} attempts`));
          }
        } else {
          reject(err);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => {
        console.log('Alternaview server stopped');
        serverInstance = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  startServer,
  stopServer,
  config,
  isRunning: () => !!serverInstance
};
