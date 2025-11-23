async function loadFiles() {
    try {
        const response = await fetch('/api/files', {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to load files');
        }

        const files = await response.json();
        displayFiles(files);
    } catch (error) {
        console.error('Error loading files:', error);
        document.getElementById('filesTableBody').innerHTML = `
            <tr><td colspan="4" class="empty-state">Error loading files</td></tr>
        `;
    }
}

function displayFiles(files) {
    const tbody = document.getElementById('filesTableBody');

    if (files.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="4" class="empty-state">No files yet. Upload some files to get started!</td></tr>
        `;
        return;
    }

    // Group files by folder
    const toAAFiles = files.filter(f => f.folder === 'TO AA');
    const fromAAFiles = files.filter(f => f.folder === 'FROM AA');

    let html = '';

    // TO AA section
    if (toAAFiles.length > 0) {
        html += `
            <tr class="folder-header">
                <td colspan="4" style="background: #f5f5f5; padding: 0.75rem 1rem; font-weight: 600; color: #333;">
                    TO AA (Files from Client)
                </td>
            </tr>
        `;
        html += toAAFiles.map(file => createFileRow(file)).join('');
    }

    // FROM AA section
    if (fromAAFiles.length > 0) {
        html += `
            <tr class="folder-header">
                <td colspan="4" style="background: #f5f5f5; padding: 0.75rem 1rem; font-weight: 600; color: #333;">
                    FROM AA (Files for Client)
                </td>
            </tr>
        `;
        html += fromAAFiles.map(file => createFileRow(file)).join('');
    }

    tbody.innerHTML = html;
}

function createFileRow(file) {
    return `
        <tr style="cursor: pointer;" onclick="window.location.href='review.html?file=${file.id}'">
            <td><div class="file-name">${escapeHtml(file.original_name)}</div></td>
            <td class="file-size">${formatFileSize(file.file_size)}</td>
            <td class="file-date">${formatDate(file.uploaded_at)}</td>
            <td onclick="event.stopPropagation()">
                <div class="file-actions">
                    <button class="btn-action" onclick="downloadFile(${file.id}, '${escapeHtml(file.original_name)}')" title="Download">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                    <button class="btn-action" onclick="deleteFile(${file.id}, '${escapeHtml(file.original_name)}')" title="Delete">
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

function triggerUpload() {
    document.getElementById('fileInput').click();
}

document.getElementById('fileInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => uploadFile(file));
});

// Drag and drop
const uploadZone = document.getElementById('uploadZone');
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#469FE0';
    uploadZone.style.background = '#f5f9fc';
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = '#ddd';
    uploadZone.style.background = 'transparent';
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#ddd';
    uploadZone.style.background = 'transparent';

    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => uploadFile(file));
});

function uploadFile(file) {
    const progressId = 'upload-' + Date.now() + '-' + Math.random();
    const progressDiv = document.getElementById('uploadProgress');

    // Create progress item
    const progressItem = document.createElement('div');
    progressItem.id = progressId;
    progressItem.style.cssText = 'background: #fafafa; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;';
    progressItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
            <span>${escapeHtml(file.name)}</span>
            <span id="${progressId}-percent">0%</span>
        </div>
        <div style="height: 6px; background: #e0e0e0; border-radius: 3px; overflow: hidden;">
            <div id="${progressId}-bar" style="height: 100%; width: 0%; background: #469FE0; transition: width 0.3s;"></div>
        </div>
    `;
    progressDiv.appendChild(progressItem);

    // Create FormData and append file
    const formData = new FormData();
    formData.append('file', file);

    // Create XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentage = ((e.loaded / e.total) * 100).toFixed(2);
            document.getElementById(progressId + '-percent').textContent = percentage + '%';
            document.getElementById(progressId + '-bar').style.width = percentage + '%';
        }
    });

    // Handle completion
    xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
            progressItem.innerHTML = `
                <div style="color: #2e7d32;">
                    ✓ Upload complete: ${escapeHtml(file.name)}
                </div>
            `;
            setTimeout(() => {
                progressItem.remove();
                loadFiles(); // Reload file list
            }, 2000);
        } else {
            const errorMsg = xhr.responseText || 'Upload failed';
            progressItem.innerHTML = `
                <div style="color: #c62828;">
                    Upload failed: ${escapeHtml(file.name)} - ${escapeHtml(errorMsg)}
                </div>
            `;
            setTimeout(() => progressItem.remove(), 8000);
        }
    });

    // Handle errors
    xhr.addEventListener('error', () => {
        progressItem.innerHTML = `
            <div style="color: #c62828;">
                Upload failed: ${escapeHtml(file.name)} - Network error
            </div>
        `;
        setTimeout(() => progressItem.remove(), 8000);
    });

    // Send request
    xhr.open('POST', '/api/upload', true);
    xhr.withCredentials = true; // Include session cookies
    xhr.send(formData);
}

function downloadFile(fileId, filename) {
    window.open(`/api/files/${fileId}/download`, '_blank');
}

async function deleteFile(fileId, filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"? This cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/files/${fileId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to delete file');
        }

        // Reload file list
        await loadFiles();
    } catch (error) {
        console.error('Error deleting file:', error);
        alert(`Failed to delete file: ${error.message}`);
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    // SQLite CURRENT_TIMESTAMP stores in UTC, append 'Z' to treat as UTC
    const utcString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
    const date = new Date(utcString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
