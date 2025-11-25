let expandedProjects = new Set();
let expandedFolders = new Set(); // Folders per project like "123-FROM AA"
let projectFiles = {}; // Cache files by project ID
let projectsCache = []; // OPTIMIZED: Cache projects globally to eliminate duplicate fetches
let projectAbortControllers = {}; // OPTIMIZED: Track abort controllers for request cancellation
let activeUploads = {}; // Track active uploads for progress display

// UX Enhancement: Toast notification system
function showToast(message, type = 'success', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Add animation styles
if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(400px); opacity: 0; }
        }
        .upload-progress-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: #3b82f6;
            transform-origin: left;
            transition: transform 0.3s ease;
            z-index: 10001;
        }
    `;
    document.head.appendChild(style);
}

// Load projects when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadProjects);
} else {
    loadProjects();
}

async function loadProjects() {
    try {
        const response = await fetch('http://localhost:3000/api/projects');
        if (!response.ok) throw new Error('Failed to load projects');

        // OPTIMIZED: Cache projects globally
        projectsCache = await response.json();

        const tbody = document.getElementById('projectsTableBody');

        if (projectsCache.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">No projects yet.</td>
                </tr>
            `;
            return;
        }

        // OPTIMIZED: Removed blocking await - createProjectRow is now sync
        const html = projectsCache.map(project => createProjectRow(project)).join('');
        tbody.innerHTML = html;
    } catch (error) {
        console.error('Error loading projects:', error);
        document.getElementById('projectsTableBody').innerHTML = `
            <tr><td colspan="5" class="empty-state">Error loading projects</td></tr>
        `;
    }
}

// OPTIMIZED: Changed from async to sync - no await needed
function createProjectRow(project) {
    const isExpanded = expandedProjects.has(project.id);

    let html = `
        <tr class="project-row" data-project="${project.id}" onclick="toggleProject(${project.id})">
            <td>
                <div class="file-name">
                    <span class="folder-icon ${isExpanded ? 'expanded' : ''}">▶</span>
                    ${escapeHtml(project.name)}
                </div>
            </td>
            <td>${formatStatus(project.status)}</td>
            <td>${project.file_count || 0} files</td>
            <td class="file-size">${formatFileSize(project.total_size || 0)}</td>
            <td onclick="event.stopPropagation()">
                <div class="file-actions">
                    <button class="btn-action" onclick="openFtpSetupForProject(${project.id}, '${escapeHtml(project.name)}', '${project.status || ''}')" title="FTP Setup">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    <button class="btn-action" onclick="copyClientPortalLinkForProject(${project.id}, '${escapeHtml(project.name)}')" title="Copy share link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                    </button>
                    <button class="btn-action" onclick="deleteProject(${project.id}, '${escapeHtml(project.name)}')" title="Delete project">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `;

    // If expanded, add folders and files
    if (isExpanded) {
        const files = projectFiles[project.id] || [];
        const fromAAFiles = files.filter(f => f.folder === 'FROM AA');
        const toAAFiles = files.filter(f => f.folder === 'TO AA');

        // FROM AA Folder
        html += createFolderRow(project.id, 'FROM AA', fromAAFiles);
        html += fromAAFiles.map(file => createFileRow(project.id, file, 'FROM AA')).join('');

        // TO AA Folder
        html += createFolderRow(project.id, 'TO AA', toAAFiles);
        html += toAAFiles.map(file => createFileRow(project.id, file, 'TO AA')).join('');
    }

    return html;
}

async function toggleProject(projectId) {
    if (expandedProjects.has(projectId)) {
        expandedProjects.delete(projectId);

        // OPTIMIZED: Cancel any in-flight request for this project
        if (projectAbortControllers[projectId]) {
            projectAbortControllers[projectId].abort();
            delete projectAbortControllers[projectId];
        }
    } else {
        expandedProjects.add(projectId);
        // Load files if not already loaded
        if (!projectFiles[projectId]) {
            try {
                // OPTIMIZED: Create abort controller for this request
                const controller = new AbortController();
                projectAbortControllers[projectId] = controller;

                const response = await fetch(`http://localhost:3000/api/projects/${projectId}/files`, {
                    signal: controller.signal
                });

                if (response.ok) {
                    projectFiles[projectId] = await response.json();
                }

                // Clean up
                delete projectAbortControllers[projectId];
            } catch (error) {
                if (error.name === 'AbortError') {
                    // Request was cancelled - this is expected
                    return;
                }
                console.error('Error loading files:', error);
                projectFiles[projectId] = [];
            }
        }
    }
    await loadProjects();
}

function createFolderRow(projectId, folderName, files) {
    const folderKey = `${projectId}-${folderName}`;
    const isExpanded = expandedFolders.has(folderKey);
    const fileCount = files.length;
    const totalSize = files.reduce((sum, f) => sum + (f.file_size || 0), 0);

    return `
        <tr class="folder-row" data-project="${projectId}" data-folder="${folderName}" onclick="toggleFolder(${projectId}, '${folderName}')">
            <td>
                <div class="folder-name" style="padding-left: 2rem;">
                    <span class="folder-icon ${isExpanded ? 'expanded' : ''}">▶</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${folderName}</span>
                </div>
            </td>
            <td colspan="2" class="file-date">${fileCount} file${fileCount !== 1 ? 's' : ''}</td>
            <td class="file-size">${formatFileSize(totalSize)}</td>
            <td></td>
        </tr>
    `;
}

function createFileRow(projectId, file, folder) {
    const folderKey = `${projectId}-${folder}`;
    const isVisible = expandedFolders.has(folderKey);

    // Check if file is audio or video
    const ext = file.original_name.split('.').pop().toLowerCase();
    const isMediaFile = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'].includes(ext);
    const fileNameHtml = isMediaFile
        ? `<a href="media_review.html?file=${file.id}&project=${projectId}" style="cursor: pointer; color: var(--accent-teal); text-decoration: none;">${escapeHtml(file.original_name)}</a>`
        : escapeHtml(file.original_name);

    return `
        <tr class="file-row ${isVisible ? 'visible' : ''}" data-project="${projectId}" data-folder="${folder}">
            <td><div class="file-name" style="padding-left: 4rem;">${fileNameHtml}</div></td>
            <td class="file-size">${formatFileSize(file.file_size)}</td>
            <td class="file-date">${formatDate(file.uploaded_at)}</td>
            <td colspan="2">
                <div class="file-actions">
                    <button class="btn-action" onclick="copyFileLink(${file.id}, '${escapeHtml(file.original_name)}')" title="Copy Link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                    </button>
                    <button class="btn-action" onclick="downloadFile(${file.id}, '${escapeHtml(file.original_name)}')" title="Download">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                    <button class="btn-action" onclick="deleteFile(${projectId}, ${file.id}, '${escapeHtml(file.original_name)}')" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

async function toggleFolder(projectId, folderName) {
    const folderKey = `${projectId}-${folderName}`;
    if (expandedFolders.has(folderKey)) {
        expandedFolders.delete(folderKey);
    } else {
        expandedFolders.add(folderKey);
    }
    await loadProjects();
}

// Open FTP setup from project list
async function openFtpSetupForProject(projectId, projectName, status) {
    await openFtpSetup(projectId, projectName, status);
}

// Copy link from project list (UX Enhancement: toast notifications)
function copyClientPortalLinkForProject(projectId, projectName) {
    const link = `http://localhost:3000/client/login.html`;
    navigator.clipboard.writeText(link).then(() => {
        showToast(`Client portal link copied for "${projectName}"`, 'success');
    }).catch(err => {
        showToast(`Failed to copy link: ${err}`, 'error');
    });
}

// Delete project (OPTIMIZED: optimistic UI update with UX enhancements)
async function deleteProject(projectId, projectName) {
    if (!confirm(`Are you sure you want to delete the project "${projectName}"?\n\nThis will delete all files and cannot be undone.`)) {
        return;
    }

    // Store for rollback
    const projectIndex = projectsCache.findIndex(p => p.id === projectId);
    const deletedProject = projectsCache[projectIndex];
    const savedFiles = projectFiles[projectId];

    try {
        // Show deleting notification
        showToast(`Deleting "${projectName}"...`, 'info', 2000);

        // OPTIMIZED: Optimistic update - remove from cache immediately
        projectsCache.splice(projectIndex, 1);
        delete projectFiles[projectId];
        expandedProjects.delete(projectId);

        // Update UI immediately
        const tbody = document.getElementById('projectsTableBody');
        const html = projectsCache.map(project => createProjectRow(project)).join('');
        tbody.innerHTML = html || '<tr><td colspan="5" class="empty-state">No projects yet.</td></tr>';

        // Background delete
        const response = await fetch(`http://localhost:3000/api/projects/${projectId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete project');
        }

        // Success notification
        showToast(`Project "${projectName}" deleted successfully`, 'success');
    } catch (error) {
        console.error('Error deleting project:', error);

        // OPTIMIZED: Rollback optimistic update on error
        projectsCache.splice(projectIndex, 0, deletedProject);
        if (savedFiles) {
            projectFiles[projectId] = savedFiles;
        }
        await loadProjects();

        showToast(`Failed to delete project "${projectName}"`, 'error');
    }
}

async function openFtpSetup(projectId, projectName, status) {
    try {
        // OPTIMIZED: Use cached project data instead of fetching again
        let project = projectsCache.find(p => p.id === projectId);

        if (!project) {
            // Fallback: fetch if not in cache
            const response = await fetch(`http://localhost:3000/api/projects/${projectId}`);
            project = await response.json();
        }

        // Build modal content HTML
        const modalContent = `
            <div class="form-group">
                <label>Project Name</label>
                <input type="text" value="${escapeHtml(project.name)}" readonly>
            </div>
            <div class="form-group">
                <label>Status</label>
                <div style="padding: 0.5rem 0;">
                    <span class="status-badge status-${project.status || 'unknown'}">${formatStatus(project.status)}</span>
                </div>
            </div>
            <div class="form-group">
                <label>Password</label>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <input id="modalPasswordInput" type="password" value="••••••••" readonly style="flex: 1; font-family: monospace;">
                    <button class="btn-secondary" id="modalPasswordToggle" onclick="parent.toggleModalPassword()">Show</button>
                </div>
            </div>
            <div class="form-group">
                <label>Files</label>
                <input type="text" value="${project.file_count || 0} files" readonly>
            </div>
            <div class="form-group">
                <label>Total Size</label>
                <input type="text" value="${formatFileSize(project.total_size || 0)}" readonly>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
                <button class="btn-primary" onclick="parent.copyClientPortalLink()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    Copy Client Portal Link
                </button>
                <button class="btn-secondary" onclick="parent.regeneratePassword()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                    Regenerate Password
                </button>
            </div>
        `;

        // Send message to parent to show modal
        window.parent.postMessage({
            type: 'show-ftp-modal',
            content: modalContent,
            project: { id: project.id, name: project.name }
        }, '*');
    } catch (error) {
        console.error('Error loading project details:', error);
        alert('Failed to load FTP setup');
    }
}

function closeFtpSetup() {
    window.parent.postMessage({ type: 'hide-ftp-modal' }, '*');
}

async function copyFileLink(fileId, fileName) {
    const fileUrl = `http://localhost:3000/api/files/${fileId}/download`;
    try {
        await navigator.clipboard.writeText(fileUrl);
        showToast(`Link copied for "${fileName}"`, 'success');
    } catch (error) {
        console.error('Error copying link:', error);
        showToast('Failed to copy link', 'error');
    }
}

async function downloadFile(fileId, fileName) {
    try {
        showToast(`Downloading "${fileName}"...`, 'info', 2000);

        const response = await fetch(`http://localhost:3000/api/files/${fileId}/download`);
        if (!response.ok) throw new Error('Download failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast(`Downloaded "${fileName}" successfully`, 'success');
    } catch (error) {
        console.error('Error downloading file:', error);
        showToast('Failed to download file', 'error');
    }
}

async function deleteFile(projectId, fileId, fileName) {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
        return;
    }

    // Store for rollback
    const files = projectFiles[projectId] || [];
    const fileIndex = files.findIndex(f => f.id === fileId);
    const deletedFile = files[fileIndex];

    try {
        // Show deleting notification
        showToast(`Deleting "${fileName}"...`, 'info', 2000);

        // OPTIMIZED: Optimistic update - remove from cache immediately
        if (projectFiles[projectId]) {
            projectFiles[projectId] = projectFiles[projectId].filter(f => f.id !== fileId);
        }

        // Update UI immediately
        await loadProjects();

        // Background delete
        const response = await fetch(`http://localhost:3000/api/files/${fileId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Delete failed');

        // Success notification
        showToast(`File "${fileName}" deleted successfully`, 'success');
    } catch (error) {
        console.error('Error deleting file:', error);

        // OPTIMIZED: Rollback optimistic update on error
        if (projectFiles[projectId] && deletedFile) {
            projectFiles[projectId].splice(fileIndex, 0, deletedFile);
        }
        await loadProjects();

        showToast(`Failed to delete file "${fileName}"`, 'error');
    }
}

// Drag and drop functionality
document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('projectsTableBody');

    // Prevent default drag behavior
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Delegate drag events to folder rows
    tbody.addEventListener('dragenter', (e) => {
        const folderRow = e.target.closest('.folder-row');
        if (folderRow) {
            folderRow.classList.add('drag-over');
        }
    });

    tbody.addEventListener('dragleave', (e) => {
        const folderRow = e.target.closest('.folder-row');
        if (folderRow) {
            folderRow.classList.remove('drag-over');
        }
    });

    tbody.addEventListener('dragover', (e) => {
        if (e.target.closest('.folder-row')) {
            e.preventDefault();
        }
    });

    tbody.addEventListener('drop', async (e) => {
        const folderRow = e.target.closest('.folder-row');
        if (folderRow) {
            folderRow.classList.remove('drag-over');
            const projectId = folderRow.dataset.project;
            const folder = folderRow.dataset.folder;
            const files = Array.from(e.dataTransfer.files);

            if (files.length > 0) {
                // Show upload starting notification
                showToast(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`, 'info', 2000);

                // Add progress bar
                const progressBar = document.createElement('div');
                progressBar.className = 'upload-progress-bar';
                progressBar.style.transform = 'scaleX(0)';
                document.body.appendChild(progressBar);

                // OPTIMIZED: Upload all files in parallel!
                try {
                    let completedUploads = 0;
                    const totalFiles = files.length;

                    const uploadPromises = files.map(async (file) => {
                        await uploadFile(file, projectId, folder);
                        completedUploads++;
                        // Update progress bar
                        const progress = completedUploads / totalFiles;
                        progressBar.style.transform = `scaleX(${progress})`;
                    });

                    // Wait for all uploads to complete
                    await Promise.all(uploadPromises);

                    // Remove progress bar
                    progressBar.remove();

                    // Refresh the project after all uploads complete
                    const response = await fetch(`http://localhost:3000/api/projects/${projectId}/files`);
                    if (response.ok) {
                        projectFiles[projectId] = await response.json();
                    }
                    await loadProjects();

                    // Success notification
                    showToast(`Successfully uploaded ${files.length} file${files.length > 1 ? 's' : ''}`, 'success');
                } catch (error) {
                    console.error('Error uploading files:', error);
                    progressBar.remove();
                    showToast('Some files failed to upload', 'error');
                }
            }
        }
    });
});

// OPTIMIZED: Returns Promise for parallel upload support
function uploadFile(file, projectId, folder) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folder);
        formData.append('projectId', projectId);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentage = ((e.loaded / e.total) * 100).toFixed(2);
                console.log(`${file.name}: ${percentage}%`);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                console.log(`✓ Uploaded: ${file.name}`);
                resolve();
            } else {
                console.error(`✗ Failed: ${file.name}`);
                reject(new Error(`Upload failed: ${file.name}`));
            }
        });

        xhr.addEventListener('error', () => {
            console.error(`✗ Network error: ${file.name}`);
            reject(new Error(`Network error: ${file.name}`));
        });

        xhr.open('POST', `http://localhost:3000/api/projects/${projectId}/upload`, true);
        xhr.send(formData);
    });
}

// Helper functions
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatStatus(status) {
    if (!status) return '<span class="status-badge status-unknown">Unknown</span>';
    return status;
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
