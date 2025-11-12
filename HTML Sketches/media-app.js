// ============================================================================
// State Management
// ============================================================================

let appMode = 'admin'; // 'admin' or 'client'
let currentProjectId = null;
let currentFiles = [];
let sortColumn = 'name';
let sortDirection = 'asc';

// ============================================================================
// DOM Elements
// ============================================================================

// Screens
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const adminProjectSelector = document.getElementById('adminProjectSelector');
const fileBrowser = document.getElementById('fileBrowser');

// Admin project list
const newProjectBtn = document.getElementById('newProjectBtn');
const projectsTableBody = document.getElementById('projectsTableBody');
const newProjectModal = document.getElementById('newProjectModal');
const newProjectForm = document.getElementById('newProjectForm');
const newProjectError = document.getElementById('newProjectError');

// Admin controls
const backToProjectsBtn = document.getElementById('backToProjectsBtn');
const adminControls = document.getElementById('adminControls');
const assignFolderBtn = document.getElementById('assignFolderBtn');
const syncFolderBtn = document.getElementById('syncFolderBtn');
const shareLinkBtn = document.getElementById('shareLinkBtn');

// Folder assignment
const assignFolderModal = document.getElementById('assignFolderModal');
const browseFolderBtn = document.getElementById('browseFolderBtn');
const createNewFolderBtn = document.getElementById('createNewFolderBtn');
const assignFolderError = document.getElementById('assignFolderError');

// File browser
const projectTitle = document.getElementById('projectTitle');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const searchInput = document.getElementById('searchInput');
const fileTableBody = document.getElementById('fileTableBody');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// Player
const playerModal = document.getElementById('playerModal');
const videoPlayer = document.getElementById('videoPlayer');
const audioPlayer = document.getElementById('audioPlayer');
const playerTitleEl = document.getElementById('playerTitle');

// ============================================================================
// Initialization
// ============================================================================

// Detect if running in Electron
const isElectron = window.electronAPI && window.electronAPI.isElectron();

// Initialize app
if (isElectron) {
    // Admin mode in Electron
    initAdminMode();
} else {
    // Client mode in browser (check for share token or show login)
    initClientMode();
}

// ============================================================================
// Mode Initialization
// ============================================================================

function initAdminMode() {
    appMode = 'admin';
    showAdminProjectSelector();
    loadProjects();
}

function initClientMode() {
    appMode = 'client';
    // TODO: Check for share token in URL or show login
    // For now, just load files directly (no auth required)
    showFileBrowser();
    loadFiles();
}

// ============================================================================
// View Management
// ============================================================================

function showAdminProjectSelector() {
    adminProjectSelector.style.display = 'block';
    fileBrowser.style.display = 'none';
    backToProjectsBtn.style.display = 'none';
}

function showFileBrowser(projectId = null) {
    adminProjectSelector.style.display = 'none';
    fileBrowser.style.display = 'block';

    if (appMode === 'admin') {
        backToProjectsBtn.style.display = 'inline-block';
        adminControls.style.display = 'flex';
    } else {
        backToProjectsBtn.style.display = 'none';
        adminControls.style.display = 'none';
    }

    if (projectId) {
        currentProjectId = projectId;
        loadFiles(projectId);
    }
}

// ============================================================================
// Event Listeners
// ============================================================================

// Admin project list
if (newProjectBtn) {
    newProjectBtn.addEventListener('click', () => {
        newProjectModal.style.display = 'flex';
    });
}

if (newProjectForm) {
    newProjectForm.addEventListener('submit', createProject);
}

if (backToProjectsBtn) {
    backToProjectsBtn.addEventListener('click', () => {
        currentProjectId = null;
        showAdminProjectSelector();
        loadProjects();
    });
}

// Admin controls
if (assignFolderBtn) {
    assignFolderBtn.addEventListener('click', () => {
        assignFolderModal.style.display = 'flex';
    });
}

if (syncFolderBtn) {
    syncFolderBtn.addEventListener('click', syncFolder);
}

if (shareLinkBtn) {
    shareLinkBtn.addEventListener('click', generateShareLink);
}

// Folder assignment
if (browseFolderBtn) {
    browseFolderBtn.addEventListener('click', browseForFolder);
}

if (createNewFolderBtn) {
    createNewFolderBtn.addEventListener('click', createNewFolder);
}

// File browser
if (uploadBtn) {
    uploadBtn.addEventListener('click', () => fileInput.click());
}

if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
}

if (searchInput) {
    searchInput.addEventListener('input', renderFiles);
}

// Modal close handlers
newProjectModal?.addEventListener('click', (e) => {
    if (e.target === newProjectModal) closeNewProjectModal();
});

assignFolderModal?.addEventListener('click', (e) => {
    if (e.target === assignFolderModal) closeAssignFolderModal();
});

playerModal?.addEventListener('click', (e) => {
    if (e.target === playerModal) closePlayer();
});

// ============================================================================
// Admin Project Management
// ============================================================================

async function loadProjects() {
    try {
        const response = await fetch('http://localhost:3000/api/projects');
        if (!response.ok) throw new Error('Failed to load projects');

        const projects = await response.json();
        renderProjects(projects);
    } catch (error) {
        console.error('Error loading projects:', error);
        projectsTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">Error loading projects</td>
            </tr>
        `;
    }
}

function renderProjects(projects) {
    if (projects.length === 0) {
        projectsTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    No projects yet. Create one to get started.
                </td>
            </tr>
        `;
        return;
    }

    projectsTableBody.innerHTML = projects.map(project => `
        <tr>
            <td>
                <div class="file-name">
                    <a href="#" onclick="openProject(${project.id}); return false;" style="color: inherit; text-decoration: none;">
                        ${escapeHtml(project.name)}
                    </a>
                </div>
            </td>
            <td>${project.file_count || 0} files</td>
            <td class="file-size">${formatFileSize(project.total_size || 0)}</td>
            <td>${project.media_folder_path ? escapeHtml(project.media_folder_path.replace('/Volumes/FTP1/', '')) : '-'}</td>
            <td>
                <div class="file-actions">
                    <button class="btn-action" onclick="generateShareLinkForProject(${project.id})" title="Share link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteProject(${project.id}, '${escapeHtml(project.name)}')" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function createProject(e) {
    e.preventDefault();

    const name = document.getElementById('newProjectName').value;
    const password = document.getElementById('newProjectPassword').value;

    try {
        const response = await fetch('http://localhost:3000/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password: password || null })
        });

        const data = await response.json();

        if (response.ok) {
            closeNewProjectModal();
            loadProjects();
            alert(`Project "${name}" created successfully!`);
        } else {
            newProjectError.textContent = data.error || 'Failed to create project';
            newProjectError.classList.add('show');
        }
    } catch (error) {
        newProjectError.textContent = 'Connection error. Please try again.';
        newProjectError.classList.add('show');
    }
}

async function deleteProject(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?\n\nThis will delete all files in the project!`)) {
        return;
    }

    try {
        const response = await fetch(`http://localhost:3000/api/projects/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadProjects();
        } else {
            const error = await response.json();
            alert(`Failed to delete project: ${error.error}`);
        }
    } catch (error) {
        alert('Failed to delete project');
    }
}

function openProject(projectId) {
    currentProjectId = projectId;
    showFileBrowser(projectId);

    // Check if project has folder assigned
    fetch(`http://localhost:3000/api/projects`)
        .then(res => res.json())
        .then(projects => {
            const project = projects.find(p => p.id === projectId);
            if (project) {
                projectTitle.textContent = project.name;
                if (project.media_folder_path) {
                    syncFolderBtn.style.display = 'inline-block';
                } else {
                    syncFolderBtn.style.display = 'none';
                }
            }
        });
}

async function generateShareLinkForProject(projectId) {
    try {
        const response = await fetch(`http://localhost:3000/api/projects/${projectId}/generate-share-link`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            const shareUrl = `${window.location.origin}/share/project/${projectId}?token=${data.token}`;

            navigator.clipboard.writeText(shareUrl).then(() => {
                alert(`Share link copied to clipboard!\n\n${shareUrl}`);
            }).catch(() => {
                alert(`Share link:\n\n${shareUrl}`);
            });
        } else {
            const error = await response.json();
            alert(`Failed to generate share link: ${error.error}`);
        }
    } catch (error) {
        alert('Failed to generate share link');
    }
}

function closeNewProjectModal() {
    newProjectModal.style.display = 'none';
    newProjectForm.reset();
    newProjectError.classList.remove('show');
}

// ============================================================================
// Folder Management (Admin Only)
// ============================================================================

async function browseForFolder() {
    if (!isElectron) {
        alert('Folder browsing is only available in the desktop app');
        return;
    }

    try {
        const result = await window.electronAPI.selectFolderDialog();

        if (result.success && result.folderPath) {
            await assignFolder(result.folderPath);
        } else if (result.error) {
            assignFolderError.textContent = result.error;
            assignFolderError.classList.add('show');
        }
    } catch (error) {
        console.error('Folder browse error:', error);
        assignFolderError.textContent = 'Failed to browse for folder';
        assignFolderError.classList.add('show');
    }
}

async function createNewFolder() {
    if (!isElectron) {
        alert('Folder creation is only available in the desktop app');
        return;
    }

    const projectName = projectTitle.textContent;

    try {
        const result = await window.electronAPI.createFolder(projectName);

        if (result.success && result.folderPath) {
            await assignFolder(result.folderPath);
        } else if (result.error) {
            assignFolderError.textContent = result.error;
            assignFolderError.classList.add('show');
        }
    } catch (error) {
        console.error('Folder creation error:', error);
        assignFolderError.textContent = 'Failed to create folder';
        assignFolderError.classList.add('show');
    }
}

async function assignFolder(folderPath) {
    try {
        const response = await fetch(`http://localhost:3000/api/projects/${currentProjectId}/assign-folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath })
        });

        if (response.ok) {
            const data = await response.json();
            closeAssignFolderModal();
            alert(`Folder assigned successfully!\n\nAdded: ${data.added}\nUpdated: ${data.updated}\nDeleted: ${data.deleted}`);
            syncFolderBtn.style.display = 'inline-block';
            loadFiles(currentProjectId);
        } else {
            const error = await response.json();
            assignFolderError.textContent = error.error || 'Failed to assign folder';
            assignFolderError.classList.add('show');
        }
    } catch (error) {
        assignFolderError.textContent = 'Connection error. Please try again.';
        assignFolderError.classList.add('show');
    }
}

async function syncFolder() {
    if (!currentProjectId) return;

    try {
        syncFolderBtn.disabled = true;
        syncFolderBtn.textContent = 'syncing...';

        const response = await fetch(`http://localhost:3000/api/projects/${currentProjectId}/sync-folder`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            alert(`Sync complete!\n\nAdded: ${data.added}\nUpdated: ${data.updated}\nDeleted: ${data.deleted}`);
            loadFiles(currentProjectId);
        } else {
            const error = await response.json();
            alert(`Sync failed: ${error.error}`);
        }
    } catch (error) {
        alert('Failed to sync folder');
    } finally {
        syncFolderBtn.disabled = false;
        syncFolderBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            sync folder
        `;
    }
}

async function generateShareLink() {
    if (!currentProjectId) return;

    try {
        const response = await fetch(`http://localhost:3000/api/projects/${currentProjectId}/generate-share-link`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            const shareUrl = `${window.location.origin}/share/project/${currentProjectId}?token=${data.token}`;

            navigator.clipboard.writeText(shareUrl).then(() => {
                alert(`Share link copied to clipboard!\n\n${shareUrl}`);
            }).catch(() => {
                alert(`Share link:\n\n${shareUrl}`);
            });
        } else {
            const error = await response.json();
            alert(`Failed to generate share link: ${error.error}`);
        }
    } catch (error) {
        alert('Failed to generate share link');
    }
}

function closeAssignFolderModal() {
    assignFolderModal.style.display = 'none';
    assignFolderError.classList.remove('show');
}

// ============================================================================
// File Management
// ============================================================================

async function loadFiles(projectId = null) {
    const endpoint = projectId ? `/api/projects/${projectId}/files` : '/api/files';

    try {
        const response = await fetch(endpoint);
        if (response.ok) {
            const files = await response.json();
            currentFiles = files.map(file => ({
                id: file.id,
                name: file.original_name || file.filename,
                modified: file.uploaded_at,
                size: file.file_size,
                type: getFileType(file.mime_type)
            }));
            renderFiles();
        } else if (response.status === 401) {
            // TODO: Show login for client mode
            console.error('Unauthorized');
        }
    } catch (error) {
        console.error('Error loading files:', error);
    }
}

async function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (!currentProjectId && appMode === 'admin') {
        alert('Please select a project first');
        return;
    }

    uploadProgress.style.display = 'block';
    let uploaded = 0;

    for (const file of files) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            progressText.textContent = `Uploading ${file.name}... (${uploaded + 1}/${files.length})`;

            const endpoint = currentProjectId ? `/api/projects/${currentProjectId}/files/upload` : '/api/files/upload';

            const response = await fetch(endpoint, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                uploaded++;
                const progress = (uploaded / files.length) * 100;
                progressFill.style.width = progress + '%';
            } else {
                const error = await response.json();
                alert(`Failed to upload ${file.name}: ${error.error}`);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Failed to upload ${file.name}`);
        }
    }

    // Hide progress and reload files
    setTimeout(() => {
        uploadProgress.style.display = 'none';
        progressFill.style.width = '0%';
        fileInput.value = '';
        loadFiles(currentProjectId);
    }, 500);
}

async function deleteFile(fileId, fileName) {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
        return;
    }

    try {
        const response = await fetch(`http://localhost:3000/api/files/${fileId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadFiles(currentProjectId);
        } else {
            const error = await response.json();
            alert(`Failed to delete file: ${error.error}`);
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete file');
    }
}

function downloadFile(fileId, fileName) {
    window.location.href = `/api/files/${fileId}/download`;
}

function playMedia(fileId, fileName, type) {
    // Open dedicated review page for video/audio
    window.location.href = `/review.html?file=${fileId}`;
}

function closePlayer() {
    playerModal.style.display = 'none';
    videoPlayer.pause();
    audioPlayer.pause();
    videoPlayer.src = '';
    audioPlayer.src = '';
}

// ============================================================================
// Rendering
// ============================================================================

function renderFiles() {
    const searchTerm = searchInput.value.toLowerCase();

    // Filter files
    let filteredFiles = currentFiles;
    if (searchTerm) {
        filteredFiles = currentFiles.filter(file =>
            file.name.toLowerCase().includes(searchTerm)
        );
    }

    // Sort files
    filteredFiles.sort((a, b) => {
        let aVal, bVal;

        switch(sortColumn) {
            case 'name':
                aVal = a.name.toLowerCase();
                bVal = b.name.toLowerCase();
                break;
            case 'modified':
                aVal = new Date(a.modified);
                bVal = new Date(b.modified);
                break;
            case 'size':
                aVal = a.size || 0;
                bVal = b.size || 0;
                break;
            case 'type':
                aVal = a.type;
                bVal = b.type;
                break;
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    // Render table
    if (filteredFiles.length === 0) {
        fileTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <p>${searchTerm ? 'No files match your search.' : 'No files yet. Upload some files to get started.'}</p>
                </td>
            </tr>
        `;
    } else {
        fileTableBody.innerHTML = filteredFiles.map(file => `
            <tr>
                <td>
                    <div class="file-name">${escapeHtml(file.name)}</div>
                </td>
                <td class="file-date">${formatDate(file.modified)}</td>
                <td class="file-size">${formatFileSize(file.size)}</td>
                <td>
                    <span class="file-type-badge badge-${file.type}">
                        ${file.type}
                    </span>
                </td>
                <td>
                    <div class="file-actions">
                        ${file.type === 'video' || file.type === 'audio' ?
                            `<button class="btn-action btn-play" onclick="playMedia(${file.id}, '${escapeHtml(file.name)}', '${file.type}')" title="Play">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            </button>` :
                            ''
                        }
                        <button class="btn-action btn-download" onclick="downloadFile(${file.id}, '${escapeHtml(file.name)}')" title="Download">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="8 9 12 13 16 9"></polyline>
                                <line x1="12" y1="3" x2="12" y2="13"></line>
                            </svg>
                        </button>
                        ${appMode === 'admin' ?
                            `<button class="btn-action btn-delete" onclick="deleteFile(${file.id}, '${escapeHtml(file.name)}')" title="Delete">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>` :
                            ''
                        }
                    </div>
                </td>
            </tr>
        `).join('');
    }

    // Update stats
    document.getElementById('itemCount').textContent = filteredFiles.length;
    const totalSize = filteredFiles.reduce((sum, file) => sum + (file.size || 0), 0);
    document.getElementById('totalSize').textContent = formatFileSize(totalSize);
}

function sortBy(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    renderFiles();
}

// ============================================================================
// Utility Functions
// ============================================================================

function getFileType(mimeType) {
    if (!mimeType) return 'file';

    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.includes('pdf')) return 'pdf';

    return 'file';
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/'/g, '&#39;');
}
