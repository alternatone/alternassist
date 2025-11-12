const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { fileQueries, projectQueries } = require('../models/database');

// Active watchers map (projectId => watcher instance)
const activeWatchers = new Map();

/**
 * Sync a folder's contents with the database
 * @param {number} projectId - Project ID
 * @param {string} folderPath - Absolute path to folder
 * @returns {Promise<Object>} - Sync results
 */
async function syncFolder(projectId, folderPath) {
  try {
    // Verify folder exists
    if (!fsSync.existsSync(folderPath)) {
      throw new Error(`Folder does not exist: ${folderPath}`);
    }

    // Get all files in folder (not recursive, just top level)
    const filesInFolder = await fs.readdir(folderPath);
    const fileDetails = [];

    // Get details for each file
    for (const filename of filesInFolder) {
      const filePath = path.join(folderPath, filename);
      try {
        const stats = await fs.stat(filePath);

        // Skip directories
        if (stats.isDirectory()) continue;

        // Get file metadata
        fileDetails.push({
          filename,
          filePath,
          fileSize: stats.size,
          mtime: stats.mtime
        });
      } catch (err) {
        console.error(`Error reading file ${filename}:`, err);
      }
    }

    // Get existing files in database for this project
    const existingFiles = fileQueries.findByProject.all(projectId);
    const existingFilePaths = new Set(existingFiles.map(f => f.file_path));

    // Track sync results
    const results = {
      added: [],
      updated: [],
      deleted: [],
      unchanged: []
    };

    // Add or update files
    for (const file of fileDetails) {
      const existingFile = existingFiles.find(f => f.file_path === file.filePath);

      if (!existingFile) {
        // Add new file
        const mimeType = getMimeType(file.filename);
        try {
          fileQueries.create.run(
            projectId,
            file.filename,
            file.filename,
            file.filePath,
            file.fileSize,
            mimeType,
            null, // duration (calculated later for video/audio)
            null  // transcoded_file_path
          );
          results.added.push(file.filename);
        } catch (err) {
          console.error(`Error adding file ${file.filename}:`, err);
        }
      } else if (existingFile.file_size !== file.fileSize) {
        // File size changed, consider it updated
        results.updated.push(file.filename);
      } else {
        results.unchanged.push(file.filename);
      }
    }

    // Mark deleted files
    const filesInFolderSet = new Set(fileDetails.map(f => f.filePath));
    for (const existingFile of existingFiles) {
      if (!filesInFolderSet.has(existingFile.file_path)) {
        // File was deleted from folder
        fileQueries.delete.run(existingFile.id);
        results.deleted.push(existingFile.original_name);
      }
    }

    // Update project timestamp
    projectQueries.updateTimestamp.run(projectId);

    return {
      success: true,
      ...results,
      totalFiles: fileDetails.length
    };
  } catch (error) {
    console.error('Folder sync error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Start watching a folder for changes
 * @param {number} projectId - Project ID
 * @param {string} folderPath - Absolute path to folder
 */
function startWatching(projectId, folderPath) {
  // Stop existing watcher if any
  stopWatching(projectId);

  try {
    const watcher = chokidar.watch(folderPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 0, // Don't watch subdirectories
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    // File added
    watcher.on('add', async (filePath) => {
      console.log(`File added: ${filePath}`);
      await syncFolder(projectId, folderPath);
    });

    // File removed
    watcher.on('unlink', async (filePath) => {
      console.log(`File removed: ${filePath}`);
      await syncFolder(projectId, folderPath);
    });

    // File changed
    watcher.on('change', async (filePath) => {
      console.log(`File changed: ${filePath}`);
      await syncFolder(projectId, folderPath);
    });

    // Error handler
    watcher.on('error', (error) => {
      console.error(`Watcher error for project ${projectId}:`, error);
    });

    activeWatchers.set(projectId, watcher);
    console.log(`Started watching folder for project ${projectId}: ${folderPath}`);
  } catch (error) {
    console.error(`Failed to start watcher for project ${projectId}:`, error);
  }
}

/**
 * Stop watching a folder
 * @param {number} projectId - Project ID
 */
function stopWatching(projectId) {
  const watcher = activeWatchers.get(projectId);
  if (watcher) {
    watcher.close();
    activeWatchers.delete(projectId);
    console.log(`Stopped watching folder for project ${projectId}`);
  }
}

/**
 * Stop all watchers
 */
function stopAllWatchers() {
  for (const [projectId, watcher] of activeWatchers.entries()) {
    watcher.close();
    console.log(`Stopped watching folder for project ${projectId}`);
  }
  activeWatchers.clear();
}

/**
 * Initialize watchers for all projects with assigned folders
 */
async function initializeWatchers() {
  try {
    const projects = projectQueries.getAll.all();
    for (const project of projects) {
      if (project.media_folder_path && fsSync.existsSync(project.media_folder_path)) {
        startWatching(project.id, project.media_folder_path);
      }
    }
    console.log(`Initialized ${activeWatchers.size} folder watchers`);
  } catch (error) {
    console.error('Error initializing watchers:', error);
  }
}

/**
 * Get MIME type from filename
 * @param {string} filename - Filename
 * @returns {string} - MIME type
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    // Video
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    // Documents
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = {
  syncFolder,
  startWatching,
  stopWatching,
  stopAllWatchers,
  initializeWatchers
};
