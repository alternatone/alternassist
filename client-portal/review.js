// State
let comments = [];
let currentFileId = null;
let activeCommentId = null;
let wasPlayingBeforeComment = false;
let commentTimecode = null;

// Elements
const videoPlayer = document.getElementById('videoPlayer');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const timecode = document.getElementById('timecode');
const progressBar = document.getElementById('progressBar');
const progressContainer = document.getElementById('progressContainer');
const volumeSlider = document.getElementById('volumeSlider');
const videoFilename = document.getElementById('videoFilename');
const authorInput = document.getElementById('authorInput');
const commentInput = document.getElementById('commentInput');
const addCommentBtn = document.getElementById('addCommentBtn');
const commentsList = document.getElementById('commentsList');
const commentMarkers = document.getElementById('commentMarkers');

// Get file ID from URL
const urlParams = new URLSearchParams(window.location.search);
currentFileId = urlParams.get('file');

// Load file
if (currentFileId) {
    loadFile();
}

async function loadFile() {
    try {
        // Load file metadata
        const filesResponse = await fetch('/api/files', {
            credentials: 'include'
        });

        if (!filesResponse.ok) {
            window.location.href = 'login.html';
            return;
        }

        const files = await filesResponse.json();
        const file = files.find(f => f.id == currentFileId);

        if (!file) {
            alert('File not found');
            window.location.href = 'index.html';
            return;
        }

        // Set video source to streaming endpoint
        videoPlayer.src = `/api/files/${currentFileId}/stream`;
        videoFilename.textContent = file.original_name;

        // Load comments
        await loadComments();

        // Load saved author from localStorage
        const savedAuthor = localStorage.getItem('review-author');
        if (savedAuthor) {
            authorInput.value = savedAuthor;
        }
    } catch (error) {
        console.error('Error loading file:', error);
        alert('Failed to load file');
    }
}

async function loadComments() {
    try {
        const response = await fetch(`/api/files/${currentFileId}/comments`, {
            credentials: 'include'
        });

        if (response.ok) {
            comments = await response.json();
            renderComments();
        }
    } catch (error) {
        console.error('Error loading comments:', error);
    }
}

async function saveComment(comment) {
    try {
        const response = await fetch(`/api/files/${currentFileId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                author_name: comment.author,
                timecode: comment.timecode,
                comment_text: comment.text
            })
        });

        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error('Error saving comment:', error);
    }
    return null;
}

// Format seconds to HH:MM:SS
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Video controls
playBtn.addEventListener('click', () => {
    if (videoPlayer.paused) {
        videoPlayer.play();
    } else {
        videoPlayer.pause();
    }
});

videoPlayer.addEventListener('play', () => {
    playIcon.setAttribute('d', 'M6 4h4v16H6V4zm8 0h4v16h-4V4z'); // Pause icon
});

videoPlayer.addEventListener('pause', () => {
    playIcon.setAttribute('d', 'M8 5v14l11-7z'); // Play icon
});

videoPlayer.addEventListener('timeupdate', () => {
    const current = videoPlayer.currentTime;
    const duration = videoPlayer.duration;

    timecode.textContent = `${formatTime(current)} / ${formatTime(duration)}`;

    if (duration > 0) {
        const percent = (current / duration) * 100;
        progressBar.style.width = percent + '%';
    }
});

videoPlayer.addEventListener('loadedmetadata', () => {
    renderComments();
});

// Navigation controls
document.getElementById('startOverBtn').addEventListener('click', () => {
    videoPlayer.currentTime = 0;
});

document.getElementById('rewind10Btn').addEventListener('click', () => {
    videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
});

document.getElementById('forward10Btn').addEventListener('click', () => {
    videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10);
});

// Progress bar click
progressContainer.addEventListener('click', (e) => {
    const rect = progressContainer.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    videoPlayer.currentTime = percent * videoPlayer.duration;
});

// Volume control
volumeSlider.addEventListener('input', (e) => {
    videoPlayer.volume = e.target.value / 100;
});

// Auto-pause when starting to type a comment
commentInput.addEventListener('focus', () => {
    if (!videoPlayer.paused) {
        wasPlayingBeforeComment = true;
        commentTimecode = videoPlayer.currentTime;
        videoPlayer.pause();
    } else {
        wasPlayingBeforeComment = false;
        commentTimecode = videoPlayer.currentTime;
    }
});

// Add comment
async function addComment() {
    const author = authorInput.value.trim();
    const text = commentInput.value.trim();

    if (!author) {
        alert('Please enter your name');
        return;
    }

    if (!text) {
        alert('Please enter a comment');
        return;
    }

    const timecodeValue = formatTime(commentTimecode);

    const comment = {
        author,
        timecode: timecodeValue,
        timeSeconds: commentTimecode,
        text,
        createdAt: new Date().toISOString()
    };

    // Save author to localStorage
    localStorage.setItem('review-author', author);

    // Save to backend
    const savedComment = await saveComment(comment);
    if (savedComment) {
        comment.id = savedComment.id;
        comments.push(comment);
        comments.sort((a, b) => a.timeSeconds - b.timeSeconds);
        renderComments();
    }

    // Clear input
    commentInput.value = '';
    commentInput.blur();

    // Resume video if it was playing
    if (wasPlayingBeforeComment) {
        videoPlayer.play();
    }
}

addCommentBtn.addEventListener('click', addComment);

// Enter key to submit comment
commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addComment();
    }
});

// Render comments
function renderComments() {
    const total = comments.length;
    document.getElementById('totalComments').textContent = total;

    if (total === 0) {
        commentsList.innerHTML = '<div class="empty-state"><p>No comments yet. Add a comment at the current timecode.</p></div>';
        commentMarkers.innerHTML = '';
        return;
    }

    commentsList.innerHTML = comments.map(comment => {
        const date = new Date(comment.createdAt);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="comment-card ${activeCommentId === comment.id ? 'active' : ''}" data-id="${comment.id}">
                <div class="comment-header">
                    <span class="comment-timecode">${comment.timecode}</span>
                </div>
                <div class="comment-author">${escapeHtml(comment.author)}</div>
                <div class="comment-text">${escapeHtml(comment.text)}</div>
            </div>
        `;
    }).join('');

    // Render markers on progress bar
    const duration = videoPlayer.duration;
    if (duration > 0) {
        commentMarkers.innerHTML = comments.map(comment => {
            const percent = (comment.timeSeconds / duration) * 100;
            return `<div class="comment-marker" style="left: ${percent}%" data-id="${comment.id}"></div>`;
        }).join('');
    }

    attachCommentListeners();
}

// Attach event listeners to comment cards
function attachCommentListeners() {
    document.querySelectorAll('.comment-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const comment = comments.find(c => c.id == id);
            if (comment) {
                videoPlayer.currentTime = comment.timeSeconds;
                activeCommentId = id;
                renderComments();
            }
        });
    });

    document.querySelectorAll('.comment-marker').forEach(marker => {
        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = marker.dataset.id;
            const comment = comments.find(c => c.id == id);
            if (comment) {
                videoPlayer.currentTime = comment.timeSeconds;
                activeCommentId = id;
                renderComments();
            }
        });
    });
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Space to play/pause
    if (e.code === 'Space' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        if (videoPlayer.paused) {
            videoPlayer.play();
        } else {
            videoPlayer.pause();
        }
    }

    // Left/Right arrows to skip
    if (e.code === 'ArrowLeft' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 5);
    }
    if (e.code === 'ArrowRight' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 5);
    }

    // M to capture timecode
    if (e.code === 'KeyM' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        commentInput.focus();
    }
});

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
