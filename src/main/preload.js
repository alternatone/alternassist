const { contextBridge, ipcRenderer } = require('electron');

/**
 * Alternassist Preload Script
 * Exposes safe APIs to the renderer process
 */

contextBridge.exposeInMainWorld('electronAPI', {
    // Environment detection
    isElectron: () => true,

    // NoteMarker PTSL APIs (only available in Electron)
    ptsl: {
        // Connection management
        connect: () => ipcRenderer.invoke('ptsl:connect'),
        disconnect: () => ipcRenderer.invoke('ptsl:disconnect'),
        getConnectionStatus: () => ipcRenderer.invoke('ptsl:getConnectionStatus'),

        // Session information
        getSessionInfo: () => ipcRenderer.invoke('ptsl:getSessionInfo'),

        // Marker creation
        createMarkersFromFile: (filePath) => ipcRenderer.invoke('ptsl:createMarkersFromFile', filePath),

        // Listen for progress updates
        onProgress: (callback) => {
            ipcRenderer.on('ptsl:progress', (_event, data) => callback(data));
        },
        removeProgressListener: () => {
            ipcRenderer.removeAllListeners('ptsl:progress');
        }
    },

    // File dialog
    openFileDialog: () => ipcRenderer.invoke('dialog:openFile')
});
