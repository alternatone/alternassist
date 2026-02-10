// Restore expanded state from localStorage
const savedExpandedProjects = localStorage.getItem('expandedProjects');
const savedExpandedFolders = localStorage.getItem('expandedFolders');
const savedExpandedFtpFolders = localStorage.getItem('expandedFtpFolders');

let expandedProjects = savedExpandedProjects ? new Set(JSON.parse(savedExpandedProjects)) : new Set();
let expandedFolders = savedExpandedFolders ? new Set(JSON.parse(savedExpandedFolders)) : new Set(); // Folders per project like "123-FROM AA"
let expandedFtpFolders = savedExpandedFtpFolders ? new Set(JSON.parse(savedExpandedFtpFolders)) : new Set(); // FTP filesystem folders
let projectFiles = {}; // Cache files by project ID
let projectsCache = []; // OPTIMIZED: Cache projects globally to eliminate duplicate fetches
let projectAbortControllers = {}; // OPTIMIZED: Track abort controllers for request cancellation
let activeUploads = {}; // Track active uploads for progress display
let ftpContentsCache = {}; // Cache FTP folder contents
let ftpBrowserEnabled = localStorage.getItem('ftpBrowserEnabled') !== 'false'; // FTP browser toggle
let selectedFtpFiles = new Set(); // Selected FTP files for batch operations

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

// Upload progress modal
function showUploadModal(fileCount) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'upload-modal-overlay';
    overlay.id = 'upload-modal-overlay';

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'upload-modal';
    modal.id = 'upload-modal';
    modal.innerHTML = `
        <div class="upload-modal-header">
            <div class="upload-modal-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
            </div>
            <div class="upload-modal-title">uploading files</div>
        </div>
        <div class="upload-modal-status" id="upload-status">starting upload of ${fileCount} file${fileCount > 1 ? 's' : ''}...</div>
        <div class="upload-progress-container">
            <div class="upload-progress-fill" id="upload-progress-fill"></div>
        </div>
        <div class="upload-progress-text" id="upload-progress-text">0%</div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    return {
        updateProgress: (current, total) => {
            const percentage = Math.round((current / total) * 100);
            const progressFill = document.getElementById('upload-progress-fill');
            const progressText = document.getElementById('upload-progress-text');
            const statusText = document.getElementById('upload-status');

            if (progressFill) progressFill.style.width = `${percentage}%`;
            if (progressText) progressText.textContent = `${percentage}%`;
            if (statusText) statusText.textContent = `uploading ${current} of ${total} file${total > 1 ? 's' : ''}...`;
        },
        showComplete: (totalFiles) => {
            const modal = document.getElementById('upload-modal');
            if (modal) {
                modal.innerHTML = `
                    <div class="upload-complete-icon">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <div class="upload-modal-title" style="text-align: center; margin-bottom: 0.5rem;">upload complete!</div>
                    <div class="upload-modal-status" style="text-align: center;">successfully uploaded ${totalFiles} file${totalFiles > 1 ? 's' : ''}</div>
                `;

                setTimeout(() => {
                    modal.style.animation = 'modalFadeIn 0.3s ease-out reverse';
                    const overlay = document.getElementById('upload-modal-overlay');
                    if (overlay) overlay.style.animation = 'overlayFadeIn 0.3s ease-out reverse';

                    setTimeout(() => {
                        modal.remove();
                        if (overlay) overlay.remove();
                    }, 300);
                }, 2000);
            }
        },
        showError: (errorMessage) => {
            const modal = document.getElementById('upload-modal');
            if (modal) {
                modal.innerHTML = `
                    <div class="upload-modal-header">
                        <div class="upload-modal-icon" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        </div>
                        <div class="upload-modal-title">upload failed</div>
                    </div>
                    <div class="upload-modal-status">${errorMessage}</div>
                `;

                setTimeout(() => {
                    modal.style.animation = 'modalFadeIn 0.3s ease-out reverse';
                    const overlay = document.getElementById('upload-modal-overlay');
                    if (overlay) overlay.style.animation = 'overlayFadeIn 0.3s ease-out reverse';

                    setTimeout(() => {
                        modal.remove();
                        if (overlay) overlay.remove();
                    }, 300);
                }, 3000);
            }
        },
        close: () => {
            const modal = document.getElementById('upload-modal');
            const overlay = document.getElementById('upload-modal-overlay');
            if (modal) modal.remove();
            if (overlay) overlay.remove();
        }
    };
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
        .upload-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            z-index: 10002;
            min-width: 400px;
            max-width: 500px;
            animation: modalFadeIn 0.3s ease-out;
        }
        .upload-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10001;
            animation: overlayFadeIn 0.3s ease-out;
        }
        @keyframes modalFadeIn {
            from { opacity: 0; transform: translate(-50%, -45%); }
            to { opacity: 1; transform: translate(-50%, -50%); }
        }
        @keyframes overlayFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        .upload-modal-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }
        .upload-modal-icon {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(70, 159, 224, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--accent-teal);
        }
        .upload-modal-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--primary-text);
        }
        .upload-modal-status {
            font-size: 0.9rem;
            color: var(--muted-text);
            margin-bottom: 1rem;
        }
        .upload-progress-container {
            width: 100%;
            height: 8px;
            background: #f0f0f0;
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 0.5rem;
        }
        .upload-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--accent-teal) 0%, var(--accent-blue) 100%);
            border-radius: 4px;
            transition: width 0.3s ease;
            width: 0%;
        }
        .upload-progress-text {
            font-size: 0.85rem;
            color: var(--subtle-text);
            text-align: center;
        }
        .upload-complete-icon {
            width: 60px;
            height: 60px;
            margin: 1rem auto;
            border-radius: 50%;
            background: rgba(16, 185, 129, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #10b981;
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
        const response = await fetch('/api/projects');
        if (!response.ok) throw new Error('Failed to load projects');

        // OPTIMIZED: Cache projects globally
        projectsCache = await response.json();

        const tbody = document.getElementById('projectsTableBody');

        let html = '';

        // Load FTP root folders if enabled
        let ftpRootFolders = [];
        if (ftpBrowserEnabled) {
            if (!ftpContentsCache['']) {
                try {
                    const ftpResponse = await fetch('/api/ftp/browse?path=');
                    if (ftpResponse.ok) {
                        ftpContentsCache[''] = await ftpResponse.json();
                    }
                } catch (error) {
                    console.error('Error loading FTP root:', error);
                }
            }
            if (ftpContentsCache['']) {
                // Get project folder names to avoid duplicates
                const projectFolderNames = new Set(
                    projectsCache
                        .filter(p => p.folder_path)
                        .map(p => p.folder_path)
                );

                // Only show FTP folders that don't have associated projects
                ftpRootFolders = ftpContentsCache[''].items
                    .filter(item => item.isDirectory && !projectFolderNames.has(item.name));
            }
        }

        if (projectsCache.length === 0 && ftpRootFolders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">No projects yet.</td>
                </tr>
            `;
            return;
        }

        // Combine FTP folders and projects, then sort alphabetically
        const allItems = [
            ...ftpRootFolders.map(folder => ({ type: 'ftp', data: folder, sortKey: folder.name.toLowerCase() })),
            ...projectsCache.map(project => ({ type: 'project', data: project, sortKey: project.name.toLowerCase() }))
        ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

        // Render all items in sorted order
        html += allItems.map(item => {
            if (item.type === 'ftp') {
                return createFtpFolderRow(item.data.name, item.data, 0);
            } else {
                return createProjectRow(item.data);
            }
        }).join('');
        tbody.innerHTML = html;

        // Load files for any expanded projects that don't have files loaded yet
        for (const projectId of expandedProjects) {
            if (!projectFiles[projectId]) {
                try {
                    const controller = new AbortController();
                    projectAbortControllers[projectId] = controller;

                    const filesResponse = await fetch(`/api/projects/${projectId}/files`, {
                        signal: controller.signal
                    });

                    if (filesResponse.ok) {
                        projectFiles[projectId] = await filesResponse.json();
                        // Re-render to show the files
                        await loadProjects();
                    }

                    delete projectAbortControllers[projectId];
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error('Error loading files for expanded project:', error);
                        projectFiles[projectId] = [];
                    }
                }
            }
        }

        // Load contents for any expanded FTP folders that don't have contents loaded yet
        for (const folderPath of expandedFtpFolders) {
            if (!ftpContentsCache[folderPath]) {
                try {
                    const response = await fetch(`/api/ftp/browse?path=${encodeURIComponent(folderPath)}`);
                    if (response.ok) {
                        ftpContentsCache[folderPath] = await response.json();
                        // Re-render to show the contents
                        await loadProjects();
                    }
                } catch (error) {
                    console.error('Error loading FTP folder contents:', error);
                }
            }
        }
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
                <div class="file-name" style="display: flex; align-items: center; gap: 0.5rem;">
                    <span class="folder-icon ${isExpanded ? 'expanded' : ''}">▶</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    ${escapeHtml(project.name)}
                </div>
            </td>
            <td>${formatStatus(project.status)}</td>
            <td>${project.file_count || 0}</td>
            <td class="file-size">${formatFileSize(project.total_size || 0)}</td>
            <td class="file-date">${project.created_at ? formatDate(new Date(project.created_at)) : ''}</td>
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
                    <button class="btn-action delete" onclick="deleteProject(${project.id}, '${escapeHtml(project.name)}')" title="Delete project">
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
    }
    // Save to localStorage
    localStorage.setItem('expandedProjects', JSON.stringify([...expandedProjects]));

    if (expandedProjects.has(projectId)) {
        // Load files if not already loaded
        if (!projectFiles[projectId]) {
            try {
                // OPTIMIZED: Create abort controller for this request
                const controller = new AbortController();
                projectAbortControllers[projectId] = controller;

                const response = await fetch(`/api/projects/${projectId}/files`, {
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
        <tr class="folder-row" data-project="${projectId}" data-folder="${folderName}" onclick="toggleFolder(${projectId}, '${folderName}')" ondragover="handleFolderDragOver(event)" ondrop="handleFolderDrop(event, ${projectId}, '${escapeHtml(folderName)}')" ondragleave="handleFolderDragLeave(event)">
            <td>
                <div class="folder-name" style="padding-left: 2rem;">
                    <span class="folder-icon ${isExpanded ? 'expanded' : ''}">▶</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${folderName}</span>
                </div>
            </td>
            <td></td>
            <td>${fileCount}</td>
            <td class="file-size">${formatFileSize(totalSize)}</td>
            <td></td>
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
        <tr class="file-row ${isVisible ? 'visible' : ''}" data-project="${projectId}" data-folder="${folder}" data-file-id="${file.id}" draggable="true" ondragstart="handleFileDragStart(event, ${projectId}, ${file.id}, '${escapeHtml(folder)}')" ondragend="handleFileDragEnd(event)">
            <td><div class="file-name" style="padding-left: 4rem;">${fileNameHtml}</div></td>
            <td></td>
            <td></td>
            <td class="file-size">${formatFileSize(file.file_size)}</td>
            <td class="file-date">${formatDate(file.uploaded_at)}</td>
            <td>
                <div class="file-actions">
                    <button class="btn-action" onclick="generatePublicLink(${projectId}, ${file.id}, '${escapeJs(file.original_name)}')" title="Generate Public Link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </button>
                    <button class="btn-action" onclick="copyFileLink(${file.id}, '${escapeJs(file.original_name)}')" title="Copy Link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                    </button>
                    <button class="btn-action" onclick="downloadFile(${file.id}, '${escapeJs(file.original_name)}')" title="Download">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                    <button class="btn-action delete" onclick="deleteFile(${projectId}, ${file.id}, '${escapeJs(file.original_name)}')" title="Delete">
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
    // Save to localStorage
    localStorage.setItem('expandedFolders', JSON.stringify([...expandedFolders]));
    await loadProjects();
}

// Open FTP setup from project list
async function openFtpSetupForProject(projectId, projectName, status) {
    await openFtpSetup(projectId, projectName, status);
}

// Generate password-protected share link (Phase 2 Security Feature)
function copyClientPortalLinkForProject(projectId, projectName) {
    // Send message to parent to show share link modal for this project
    window.parent.postMessage({
        type: 'show-share-link-modal',
        projectId: projectId,
        projectName: projectName,
        shareType: 'project'
    }, '*');
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
        const response = await fetch(`/api/projects/${projectId}`, {
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
            const response = await fetch(`/api/projects/${projectId}`);
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
    // Send message to parent to show share link modal for this file
    window.parent.postMessage({
        type: 'show-share-link-modal',
        fileId: fileId,
        fileName: fileName,
        shareType: 'file'
    }, '*');
}

async function downloadFile(fileId, fileName) {
    // Create or get download progress overlay
    let overlay = document.getElementById('downloadProgressOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'downloadProgressOverlay';
        overlay.innerHTML = `
            <div class="download-progress-modal">
                <div class="download-progress-header">
                    <span class="download-progress-title">Downloading...</span>
                    <button class="download-progress-cancel" onclick="cancelDownload()">&times;</button>
                </div>
                <div class="download-progress-filename"></div>
                <div class="download-progress-bar-container">
                    <div class="download-progress-bar"></div>
                </div>
                <div class="download-progress-stats">
                    <span class="download-progress-percent">0%</span>
                    <span class="download-progress-size"></span>
                </div>
            </div>
        `;
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7); display: flex; align-items: center;
            justify-content: center; z-index: 10000;
        `;
        const modalStyle = `
            background: var(--card-bg, #1e1e1e); border-radius: 8px; padding: 1.5rem;
            min-width: 350px; max-width: 450px; color: var(--text-color, #fff);
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.download-progress-modal').style.cssText = modalStyle;
        overlay.querySelector('.download-progress-header').style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;';
        overlay.querySelector('.download-progress-title').style.cssText = 'font-weight: 600; font-size: 1rem;';
        overlay.querySelector('.download-progress-cancel').style.cssText = 'background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;';
        overlay.querySelector('.download-progress-filename').style.cssText = 'font-size: 0.85rem; color: #888; margin-bottom: 1rem; word-break: break-all;';
        overlay.querySelector('.download-progress-bar-container').style.cssText = 'background: #333; border-radius: 4px; height: 8px; overflow: hidden; margin-bottom: 0.5rem;';
        overlay.querySelector('.download-progress-bar').style.cssText = 'background: var(--accent-teal, #00d4aa); height: 100%; width: 0%; transition: width 0.1s;';
        overlay.querySelector('.download-progress-stats').style.cssText = 'display: flex; justify-content: space-between; font-size: 0.85rem; color: #888;';
    }

    // Show overlay and reset
    overlay.style.display = 'flex';
    overlay.querySelector('.download-progress-filename').textContent = fileName;
    overlay.querySelector('.download-progress-bar').style.width = '0%';
    overlay.querySelector('.download-progress-percent').textContent = '0%';
    overlay.querySelector('.download-progress-size').textContent = '';

    // Store abort controller globally so cancel button can use it
    window.currentDownloadController = new AbortController();

    try {
        const response = await fetch(`/api/files/public/${fileId}/download`, {
            signal: window.currentDownloadController.signal
        });

        if (!response.ok) throw new Error('Download failed');

        const contentLength = response.headers.get('Content-Length');
        const total = parseInt(contentLength, 10);
        let loaded = 0;

        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            loaded += value.length;

            // Update progress
            const percent = total ? Math.round((loaded / total) * 100) : 0;
            overlay.querySelector('.download-progress-bar').style.width = `${percent}%`;
            overlay.querySelector('.download-progress-percent').textContent = `${percent}%`;
            overlay.querySelector('.download-progress-size').textContent = `${formatFileSize(loaded)} / ${formatFileSize(total)}`;
        }

        // Combine chunks and trigger download
        const blob = new Blob(chunks);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Download complete', 'success');
    } catch (error) {
        if (error.name === 'AbortError') {
            showToast('Download cancelled', 'info');
        } else {
            console.error('Download error:', error);
            showToast('Download failed', 'error');
        }
    } finally {
        overlay.style.display = 'none';
        window.currentDownloadController = null;
    }
}

function cancelDownload() {
    if (window.currentDownloadController) {
        window.currentDownloadController.abort();
    }
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
        const response = await fetch(`/api/files/${fileId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Delete response:', response.status, errorData);
            throw new Error(errorData.error || 'Delete failed');
        }

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

    // Delegate drag events to folder rows and project rows
    tbody.addEventListener('dragenter', (e) => {
        const targetRow = e.target.closest('.folder-row, .project-row');
        if (targetRow) {
            targetRow.classList.add('drag-over');
        }
    });

    tbody.addEventListener('dragleave', (e) => {
        const targetRow = e.target.closest('.folder-row, .project-row');
        // Only remove highlight if we're actually leaving the row (not just entering a child element)
        if (targetRow && !targetRow.contains(e.relatedTarget)) {
            targetRow.classList.remove('drag-over');
        }
    });

    tbody.addEventListener('dragover', (e) => {
        if (e.target.closest('.folder-row, .project-row')) {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    tbody.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const targetRow = e.target.closest('.folder-row, .project-row');
        console.log('Drop event:', { targetRow, files: e.dataTransfer.files.length });

        if (targetRow) {
            targetRow.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files);

            if (files.length === 0) {
                console.log('No files to upload');
                return;
            }

            // Check if it's a project folder or FTP folder
            const ftpPath = targetRow.dataset.ftpPath;
            const projectId = targetRow.dataset.project;
            const folder = targetRow.dataset.folder;

            console.log('Upload target:', { ftpPath, projectId, folder });

            if (ftpPath !== undefined) {
                // FTP folder upload
                console.log('Uploading to FTP:', ftpPath, files.length, 'files');
                await uploadToFtpFolder(ftpPath, files);
            } else if (projectId && folder) {
                // Project folder upload
                console.log('Uploading to project folder:', projectId, folder, files.length, 'files');
                await uploadToProjectFolder(parseInt(projectId), folder, files);
            } else if (projectId && !folder) {
                // Dropped on project row - default to "FROM CLIENT" folder
                console.log('Uploading to project FROM CLIENT:', projectId, files.length, 'files');
                await uploadToProjectFolder(parseInt(projectId), 'FROM CLIENT', files);
            }
        }
    });
});

// Upload to project folder (existing functionality)
async function uploadToProjectFolder(projectId, folder, files) {
    console.log('uploadToProjectFolder called:', projectId, folder, files.length);
    const uploadModal = showUploadModal(files.length);
    console.log('Upload modal created:', uploadModal);

    try {
        const totalFiles = files.length;

        // Track progress for each file
        const fileProgress = new Array(files.length).fill(0);
        const fileSizes = files.map(f => f.size);
        const totalSize = fileSizes.reduce((a, b) => a + b, 0);

        const updateOverallProgress = () => {
            const totalLoaded = fileProgress.reduce((a, b) => a + b, 0);
            const percentage = totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0;
            const completedFiles = fileProgress.filter((p, i) => p >= fileSizes[i]).length;

            const progressFill = document.getElementById('upload-progress-fill');
            const progressText = document.getElementById('upload-progress-text');
            const statusText = document.getElementById('upload-status');

            if (progressFill) progressFill.style.width = `${percentage}%`;
            if (progressText) progressText.textContent = `${percentage}%`;
            if (statusText) statusText.textContent = `uploading ${completedFiles} of ${totalFiles} file${totalFiles > 1 ? 's' : ''}...`;
        };

        const uploadPromises = files.map((file, index) => {
            return uploadFile(file, projectId, folder, (loaded) => {
                fileProgress[index] = loaded;
                updateOverallProgress();
            });
        });

        await Promise.all(uploadPromises);

        // Refresh the project after all uploads complete
        const response = await fetch(`/api/projects/${projectId}/files`);
        if (response.ok) {
            projectFiles[projectId] = await response.json();
        }
        await loadProjects();

        uploadModal.showComplete(files.length);
    } catch (error) {
        console.error('Error uploading files:', error);
        uploadModal.showError('some files failed to upload. please try again.');
    }
}

// OPTIMIZED: Returns Promise for parallel upload support
function uploadFile(file, projectId, folder, onProgress) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folder);
        formData.append('projectId', projectId);

        const xhr = new XMLHttpRequest();
        xhr.withCredentials = true;  // Include session cookies

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentage = ((e.loaded / e.total) * 100).toFixed(2);
                console.log(`${file.name}: ${percentage}%`);
                if (onProgress) onProgress(e.loaded);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                console.log(`✓ Uploaded: ${file.name}`);
                if (onProgress) onProgress(file.size);  // Ensure 100% on complete
                resolve();
            } else {
                console.error(`✗ Failed: ${file.name}, status: ${xhr.status}, response: ${xhr.responseText}`);
                reject(new Error(`Upload failed: ${file.name} (${xhr.status}: ${xhr.responseText})`));
            }
        });

        xhr.addEventListener('error', () => {
            console.error(`✗ Network error: ${file.name}`);
            reject(new Error(`Network error: ${file.name}`));
        });

        xhr.open('POST', `/api/projects/${projectId}/upload`, true);
        xhr.send(formData);
    });
}

// Upload to FTP folder
async function uploadToFtpFolder(ftpPath, files) {
    const uploadModal = showUploadModal(files.length);

    try {
        let completedUploads = 0;
        const totalFiles = files.length;

        const uploadPromises = files.map(async (file) => {
            await uploadFileToFtp(file, ftpPath);
            completedUploads++;
            uploadModal.updateProgress(completedUploads, totalFiles);
        });

        await Promise.all(uploadPromises);

        // Clear cache and refresh
        delete ftpContentsCache[ftpPath];
        await loadProjects();

        uploadModal.showComplete(files.length);
    } catch (error) {
        console.error('Error uploading files to FTP:', error);
        uploadModal.showError('some files failed to upload. please try again.');
    }
}

function uploadFileToFtp(file, ftpPath) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', ftpPath);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentage = ((e.loaded / e.total) * 100).toFixed(2);
                console.log(`${file.name}: ${percentage}%`);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                console.log(`✓ Uploaded to FTP: ${file.name}`);
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

        xhr.open('POST', '/api/ftp/upload', true);
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

function escapeJs(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
}

// ============== FTP BROWSER FUNCTIONS ==============

function createFtpFolderRow(folderName, folderData, indentLevel) {
    const folderPath = folderName;
    const isExpanded = expandedFtpFolders.has(folderPath);
    const paddingLeft = indentLevel * 2;

    let html = `
        <tr class="project-row ftp-folder-row" data-ftp-path="${escapeHtml(folderPath)}" onclick="toggleFtpFolder('${escapeHtml(folderPath)}')">
            <td>
                <div class="file-name" style="display: flex; align-items: center; gap: 0.5rem; padding-left: ${paddingLeft}rem;">
                    <span class="folder-icon ${isExpanded ? 'expanded' : ''}">▶</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <strong>${escapeHtml(folderName)}</strong>
                    ${folderData.projectName ? `<span style="color: var(--accent-teal); margin-left: 0.5rem; font-size: 0.85em;">(${escapeHtml(folderData.projectName)})</span>` : ''}
                </div>
            </td>
            <td></td>
            <td>${folderData.itemCount || 0}</td>
            <td class="file-size">${formatFileSize(folderData.totalSize || 0)}</td>
            <td class="file-date">${formatDate(folderData.modified)}</td>
            <td onclick="event.stopPropagation()">
                <div class="file-actions">
                    <button class="btn-action" onclick="copyFtpFileLink('${escapeHtml(folderPath)}', '${escapeHtml(folderName)}')" title="Copy Link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                    </button>
                    <button class="btn-action" onclick="downloadFtpFolder('${escapeHtml(folderPath)}', '${escapeHtml(folderName)}')" title="Download Folder">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                    <button class="btn-action delete" onclick="deleteFtpItem('${escapeHtml(folderPath)}', '${escapeHtml(folderName)}', true)" title="Delete folder">
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

    // If expanded, show contents
    if (isExpanded && ftpContentsCache[folderPath]) {
        html += renderFtpContents(folderPath, ftpContentsCache[folderPath], indentLevel + 1);
    }

    return html;
}

async function toggleFtpFolder(folderPath) {
    if (expandedFtpFolders.has(folderPath)) {
        expandedFtpFolders.delete(folderPath);
    } else {
        expandedFtpFolders.add(folderPath);

        // Load contents if not cached
        if (!ftpContentsCache[folderPath]) {
            try {
                const response = await fetch(`/api/ftp/browse?path=${encodeURIComponent(folderPath)}`);
                if (response.ok) {
                    ftpContentsCache[folderPath] = await response.json();
                } else {
                    showToast('Failed to browse FTP folder', 'error');
                    expandedFtpFolders.delete(folderPath);
                }
            } catch (error) {
                console.error('Error browsing FTP folder:', error);
                showToast('Error browsing FTP folder', 'error');
                expandedFtpFolders.delete(folderPath);
            }
        }
    }

    // Save to localStorage
    localStorage.setItem('expandedFtpFolders', JSON.stringify([...expandedFtpFolders]));

    // Re-render
    await loadProjects();
}

function renderFtpContents(parentPath, contents, indentLevel) {
    let html = '';

    // Sort: folders first, then files
    const folders = contents.items.filter(item => item.isDirectory);
    const files = contents.items.filter(item => !item.isDirectory);

    // Render folders
    for (const folder of folders) {
        const folderPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
        const isExpanded = expandedFtpFolders.has(folderPath);
        const paddingLeft = (indentLevel + 1) * 2;

        html += `
            <tr class="folder-row ftp-folder-row" data-ftp-path="${escapeHtml(folderPath)}" onclick="toggleFtpFolder('${escapeHtml(folderPath)}')">
                <td>
                    <div class="folder-name" style="padding-left: ${paddingLeft}rem;">
                        <span class="folder-icon ${isExpanded ? 'expanded' : ''}">▶</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span>${escapeHtml(folder.name)}</span>
                        ${folder.projectName ? `<span style="color: var(--accent-teal); margin-left: 0.5rem; font-size: 0.85em;">(${escapeHtml(folder.projectName)})</span>` : ''}
                    </div>
                </td>
                <td></td>
                <td>${folder.itemCount || 0}</td>
                <td class="file-size">${formatFileSize(folder.totalSize || 0)}</td>
                <td class="file-date">${formatDate(folder.modified)}</td>
                <td onclick="event.stopPropagation()">
                    <div class="file-actions">
                        <button class="btn-action" onclick="copyFtpFileLink('${escapeHtml(folderPath)}', '${escapeHtml(folder.name)}')" title="Copy Link">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                        </button>
                        <button class="btn-action" onclick="downloadFtpFolder('${escapeHtml(folderPath)}', '${escapeHtml(folder.name)}')" title="Download Folder">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <button class="btn-action delete" onclick="deleteFtpItem('${escapeHtml(folderPath)}', '${escapeHtml(folder.name)}', true)" title="Delete folder">
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

        // If this folder is expanded, show its contents
        if (isExpanded && ftpContentsCache[folderPath]) {
            html += renderFtpContents(folderPath, ftpContentsCache[folderPath], indentLevel + 1);
        }
    }

    // Render files
    for (const file of files) {
        const filePath = parentPath ? `${parentPath}/${file.name}` : file.name;
        const paddingLeft = (indentLevel + 1) * 2;

        // Check if file is a media file
        const isMediaFile = file.isMedia;
        const fileNameHtml = isMediaFile
            ? `<a href="media_review.html?ftpFile=${encodeURIComponent(filePath)}" style="cursor: pointer; color: var(--accent-teal); text-decoration: none;">${escapeHtml(file.name)}</a>`
            : escapeHtml(file.name);

        const isSelected = selectedFtpFiles.has(filePath);

        html += `
            <tr class="file-row ftp-file-row visible ${isSelected ? 'selected' : ''}" data-ftp-path="${escapeHtml(filePath)}">
                <td>
                    <div class="file-name" style="padding-left: ${paddingLeft}rem; display: flex; align-items: center; gap: 0.5rem;">
                        <input type="checkbox"
                               class="file-checkbox"
                               ${isSelected ? 'checked' : ''}
                               onchange="toggleFileSelection('${escapeHtml(filePath)}')"
                               onclick="event.stopPropagation()">
                        ${fileNameHtml}
                    </div>
                </td>
                <td></td>
                <td></td>
                <td class="file-size">${formatFileSize(file.size)}</td>
                <td class="file-date">${formatDate(file.modified)}</td>
                <td>
                    <div class="file-actions">
                        ${isMediaFile ? `
                            <button class="btn-action" onclick="window.location.href='media_review.html?ftpFile=${encodeURIComponent(filePath)}'" title="Play">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                            </button>
                        ` : ''}
                        <button class="btn-action" onclick="copyFtpFileLink('${escapeHtml(filePath)}', '${escapeHtml(file.name)}')" title="Copy Link">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                        </button>
                        <button class="btn-action" onclick="downloadFtpFile('${escapeHtml(filePath)}', '${escapeHtml(file.name)}')" title="Download">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <button class="btn-action delete" onclick="deleteFtpItem('${escapeHtml(filePath)}', '${escapeHtml(file.name)}', false)" title="Delete">
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

    return html;
}

async function downloadFtpFile(filePath, fileName) {
    // Create or get download progress overlay
    let overlay = document.getElementById('downloadProgressOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'downloadProgressOverlay';
        overlay.innerHTML = `
            <div class="download-progress-modal">
                <div class="download-progress-header">
                    <span class="download-progress-title">Downloading...</span>
                    <button class="download-progress-cancel" onclick="cancelDownload()">&times;</button>
                </div>
                <div class="download-progress-filename"></div>
                <div class="download-progress-bar-container">
                    <div class="download-progress-bar"></div>
                </div>
                <div class="download-progress-stats">
                    <span class="download-progress-percent">0%</span>
                    <span class="download-progress-size"></span>
                </div>
            </div>
        `;
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7); display: flex; align-items: center;
            justify-content: center; z-index: 10000;
        `;
        const modalStyle = `
            background: var(--card-bg, #1e1e1e); border-radius: 8px; padding: 1.5rem;
            min-width: 350px; max-width: 450px; color: var(--text-color, #fff);
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.download-progress-modal').style.cssText = modalStyle;
        overlay.querySelector('.download-progress-header').style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;';
        overlay.querySelector('.download-progress-title').style.cssText = 'font-weight: 600; font-size: 1rem;';
        overlay.querySelector('.download-progress-cancel').style.cssText = 'background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;';
        overlay.querySelector('.download-progress-filename').style.cssText = 'font-size: 0.85rem; color: #888; margin-bottom: 1rem; word-break: break-all;';
        overlay.querySelector('.download-progress-bar-container').style.cssText = 'background: #333; border-radius: 4px; height: 8px; overflow: hidden; margin-bottom: 0.5rem;';
        overlay.querySelector('.download-progress-bar').style.cssText = 'background: var(--accent-teal, #00d4aa); height: 100%; width: 0%; transition: width 0.1s;';
        overlay.querySelector('.download-progress-stats').style.cssText = 'display: flex; justify-content: space-between; font-size: 0.85rem; color: #888;';
    }

    // Show overlay and reset
    overlay.style.display = 'flex';
    overlay.querySelector('.download-progress-filename').textContent = fileName;
    overlay.querySelector('.download-progress-bar').style.width = '0%';
    overlay.querySelector('.download-progress-percent').textContent = '0%';
    overlay.querySelector('.download-progress-size').textContent = '';

    // Store abort controller globally so cancel button can use it
    window.currentDownloadController = new AbortController();

    try {
        const response = await fetch(`/api/ftp/download?path=${encodeURIComponent(filePath)}`, {
            signal: window.currentDownloadController.signal
        });

        if (!response.ok) throw new Error('Download failed');

        const contentLength = response.headers.get('Content-Length');
        const total = parseInt(contentLength, 10);
        let loaded = 0;

        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            loaded += value.length;

            // Update progress
            const percent = total ? Math.round((loaded / total) * 100) : 0;
            overlay.querySelector('.download-progress-bar').style.width = `${percent}%`;
            overlay.querySelector('.download-progress-percent').textContent = `${percent}%`;
            overlay.querySelector('.download-progress-size').textContent = `${formatFileSize(loaded)} / ${formatFileSize(total)}`;
        }

        // Combine chunks and trigger download
        const blob = new Blob(chunks);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Download complete', 'success');
    } catch (error) {
        if (error.name === 'AbortError') {
            showToast('Download cancelled', 'info');
        } else {
            console.error('Download error:', error);
            showToast('Download failed', 'error');
        }
    } finally {
        overlay.style.display = 'none';
        window.currentDownloadController = null;
    }
}

async function downloadFtpFolder(folderPath, folderName) {
    try {
        showToast(`Preparing to download folder "${folderName}"...`, 'info', 3000);

        // Note: This would require a backend endpoint to zip the folder
        // For now, we'll show a message
        showToast('Folder download feature coming soon', 'info');
    } catch (error) {
        console.error('Error downloading FTP folder:', error);
        showToast('Failed to download folder', 'error');
    }
}

async function deleteFtpItem(itemPath, itemName, isFolder) {
    const itemType = isFolder ? 'folder' : 'file';
    const confirmMessage = isFolder
        ? `Are you sure you want to delete the folder "${itemName}" and all its contents?\n\nThis cannot be undone.`
        : `Are you sure you want to delete "${itemName}"?\n\nThis cannot be undone.`;

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        showToast(`Deleting ${itemType} "${itemName}"...`, 'info', 2000);

        const response = await fetch(`/api/ftp/delete?path=${encodeURIComponent(itemPath)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }

        // Clear cache for parent folder
        const parentPath = itemPath.split('/').slice(0, -1).join('/');
        delete ftpContentsCache[parentPath];

        // If deleting a folder, clear its cache and all child caches
        if (isFolder) {
            Object.keys(ftpContentsCache).forEach(key => {
                if (key.startsWith(itemPath)) {
                    delete ftpContentsCache[key];
                }
            });
            expandedFtpFolders.delete(itemPath);
        }

        // Re-render
        await loadProjects();

        showToast(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} "${itemName}" deleted successfully`, 'success');
    } catch (error) {
        console.error('Error deleting FTP item:', error);
        showToast(`Failed to delete ${itemType}: ${error.message}`, 'error');
    }
}

async function copyFtpFileLink(filePath, fileName) {
    // Send message to parent to show share link modal for this FTP file
    window.parent.postMessage({
        type: 'show-share-link-modal',
        ftpPath: filePath,
        fileName: fileName,
        shareType: 'ftp'
    }, '*');
}

function toggleFileSelection(filePath) {
    if (selectedFtpFiles.has(filePath)) {
        selectedFtpFiles.delete(filePath);
    } else {
        selectedFtpFiles.add(filePath);
    }

    // Update selection UI
    updateSelectionUI();

    // Re-render to update checkboxes
    loadProjects();
}

function updateSelectionUI() {
    const selectionBar = document.getElementById('selectionBar');
    const selectedCount = selectedFtpFiles.size;

    if (selectedCount > 0) {
        if (!selectionBar) {
            createSelectionBar();
        } else {
            document.getElementById('selectedCount').textContent = selectedCount;
        }
    } else {
        if (selectionBar) {
            selectionBar.remove();
        }
    }
}

function createSelectionBar() {
    const bar = document.createElement('div');
    bar.id = 'selectionBar';
    bar.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 16px;
        z-index: 1000;
        font-family: var(--font-primary);
    `;

    bar.innerHTML = `
        <span id="selectedCount" style="font-weight: 500;">${selectedFtpFiles.size}</span>
        <span style="color: var(--subtle-text);">file${selectedFtpFiles.size !== 1 ? 's' : ''} selected</span>
        <button onclick="shareSelectedFiles()" style="
            background: var(--accent-teal);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            font-family: var(--font-primary);
        ">share selected</button>
        <button onclick="clearSelection()" style="
            background: #f0f0f0;
            color: var(--primary-text);
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-family: var(--font-primary);
        ">clear</button>
    `;

    document.body.appendChild(bar);
}

async function shareSelectedFiles() {
    if (selectedFtpFiles.size === 0) {
        showToast('No files selected', 'error');
        return;
    }

    try {
        const filePaths = Array.from(selectedFtpFiles);
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/client_login.html?files=${encodeURIComponent(JSON.stringify(filePaths))}`;

        await navigator.clipboard.writeText(shareUrl);
        showToast(`Share link copied for ${filePaths.length} file${filePaths.length !== 1 ? 's' : ''}`, 'success');
    } catch (error) {
        console.error('Error sharing selected files:', error);
        showToast('Failed to copy share link', 'error');
    }
}

function clearSelection() {
    selectedFtpFiles.clear();
    updateSelectionUI();
    loadProjects();
}

// ============== BACKUP FUNCTION ==============

async function backupFTP() {
    if (!confirm('This will backup the FTP drive to FTP BACKUP. This may take several minutes depending on the size of your data.\n\nContinue?')) {
        return;
    }

    try {
        showToast('Starting backup... This may take a while.', 'info', 5000);

        const response = await fetch('/api/ftp/backup', {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok) {
            showToast('Backup completed successfully!', 'success', 5000);
            console.log('Backup output:', result.output);
        } else {
            throw new Error(result.error || 'Backup failed');
        }
    } catch (error) {
        console.error('Error running backup:', error);
        showToast(`Backup failed: ${error.message}`, 'error', 5000);
    }
}

// ============== DRAG AND DROP FUNCTIONS ==============

let draggedFileData = null;

function handleFileDragStart(event, projectId, fileId, folder) {
    draggedFileData = { projectId, fileId, folder };
    event.currentTarget.style.opacity = '0.5';
    event.dataTransfer.effectAllowed = 'move';
}

function handleFileDragEnd(event) {
    event.currentTarget.style.opacity = '1';
}

function handleFolderDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.style.backgroundColor = 'rgba(70, 159, 224, 0.1)';
}

function handleFolderDragLeave(event) {
    event.currentTarget.style.backgroundColor = '';
}

async function handleFolderDrop(event, targetProjectId, targetFolder) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.style.backgroundColor = '';

    // Check if this is a file upload from computer (not a move within app)
    if (!draggedFileData && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        // Handle file upload
        const files = Array.from(event.dataTransfer.files);
        console.log(`Uploading ${files.length} file(s) to project ${targetProjectId}, folder "${targetFolder}"`);

        try {
            await uploadToProjectFolder(targetProjectId, targetFolder, files);
        } catch (error) {
            console.error('Error uploading files:', error);
            showToast('Upload failed', 'error');
        }
        return;
    }

    if (!draggedFileData) return;

    const { projectId, fileId, folder: sourceFolder } = draggedFileData;

    // Don't allow dropping on the same folder
    if (projectId === targetProjectId && sourceFolder === targetFolder) {
        showToast('File is already in this folder', 'info');
        draggedFileData = null;
        return;
    }

    try {
        showToast('Moving file...', 'info', 2000);

        const response = await fetch(`/api/projects/${projectId}/files/${fileId}/move`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetProjectId,
                targetFolder
            })
        });

        if (!response.ok) {
            throw new Error('Failed to move file');
        }

        showToast('File moved successfully', 'success');

        // Clear cached file data for both source and target projects
        delete projectFiles[projectId];
        if (targetProjectId !== projectId) {
            delete projectFiles[targetProjectId];
        }

        // Reload projects to reflect changes
        await loadProjects();
    } catch (error) {
        console.error('Error moving file:', error);
        showToast('Failed to move file', 'error');
    }

    draggedFileData = null;
}

// Generate public download link
async function generatePublicLink(projectId, fileId, fileName) {
    try {
        showToast('Generating public link...', 'info', 2000);

        // Find file in cached project files
        const files = projectFiles[projectId] || [];
        const file = files.find(f => f.id === fileId);

        if (!file || !file.file_path) {
            throw new Error('File not found or missing file path');
        }

        // Generate the download token
        const response = await fetch('/api/downloads/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_path: file.file_path
            })
        });

        if (!response.ok) {
            throw new Error('Failed to generate download link');
        }

        const { url, expires_at } = await response.json();

        // Show modal with the link
        showPublicLinkModal(fileName, url, expires_at);
    } catch (error) {
        console.error('Error generating public link:', error);
        showToast('Failed to generate public link', 'error');
    }
}

// Show modal with public link
function showPublicLinkModal(fileName, url, expiresAt) {
    const expiryDate = new Date(expiresAt * 1000).toLocaleString();

    const modalHtml = `
        <div class="modal show" id="publicLinkModal" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        ">
            <div class="modal-content" style="
                background: white;
                padding: 2rem;
                border-radius: 12px;
                max-width: 600px;
                width: 90%;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            ">
                <h2 style="
                    font-family: var(--font-display);
                    font-size: 1.5rem;
                    margin: 0 0 1rem 0;
                    color: #333;
                ">Public Download Link</h2>

                <p style="
                    font-family: var(--font-body);
                    color: #666;
                    margin-bottom: 1rem;
                ">
                    <strong style="color: #333;">${escapeHtml(fileName)}</strong>
                </p>

                <div style="
                    background: #f5f5f5;
                    padding: 1rem;
                    border-radius: 6px;
                    margin-bottom: 1rem;
                    word-break: break-all;
                    font-family: var(--font-mono);
                    font-size: 0.9rem;
                ">${escapeHtml(url)}</div>

                <p style="
                    font-family: var(--font-body);
                    font-size: 0.85rem;
                    color: #888;
                    margin-bottom: 1.5rem;
                ">Expires: ${expiryDate}</p>

                <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                    <button onclick="copyPublicLink('${url}')" style="
                        font-family: var(--font-primary);
                        background: var(--accent-teal);
                        color: white;
                        border: none;
                        padding: 0.75rem 1.5rem;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 500;
                    ">Copy Link</button>
                    <button onclick="closePublicLinkModal()" style="
                        font-family: var(--font-primary);
                        background: #e0e0e0;
                        color: #333;
                        border: none;
                        padding: 0.75rem 1.5rem;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 500;
                    ">Close</button>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('publicLinkModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Copy public link to clipboard
function copyPublicLink(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('Link copied to clipboard!', 'success');
        closePublicLinkModal();
    }).catch(err => {
        showToast('Failed to copy link', 'error');
    });
}

// Close public link modal
function closePublicLinkModal() {
    const modal = document.getElementById('publicLinkModal');
    if (modal) {
        modal.remove();
    }
}
