// Media Review Player Integration

let currentMediaFileId = null;
let currentMediaFileName = null;

async function loadMediaFile(fileId, fileName) {
    currentMediaFileId = fileId;
    currentMediaFileName = fileName;

    // Get the iframe
    const iframe = document.querySelector('#mediaReviewPlayer iframe');

    if (iframe && iframe.contentWindow) {
        // Send message to iframe to load the file
        iframe.contentWindow.postMessage({
            type: 'loadMediaFile',
            fileId: fileId,
            fileName: fileName
        }, '*');
    }
}

// Listen for messages from the media review player iframe
window.addEventListener('message', (event) => {
    if (event.data.type === 'closeMediaReview') {
        closeMediaReview();
    }
});

// Update the media review player to have a back button that sends this message
