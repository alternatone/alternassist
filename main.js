const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// NoteMarker PTSL imports
const { PTSLConnectionManager } = require('./src/notemarker/ptsl-connection-manager');
const MarkerCreationPipeline = require('./src/notemarker/marker-creation-pipeline');

// PTSL manager instances
let ptslManager = null;
let markerPipeline = null;

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableWebSQL: false,
            spellcheck: false,
            preload: path.join(__dirname, 'preload.js')
        },
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#FDF8F0',
        show: false,
        useContentSize: true
    });

    mainWindow.loadFile('index.html');

    // Show window when ready to prevent flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Disable throttling when hidden
    mainWindow.webContents.setBackgroundThrottling(false);

    // Open DevTools in development (optional - remove for production)
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Initialize PTSL for NoteMarker
function initializePTSL() {
    try {
        ptslManager = new PTSLConnectionManager({
            host: 'localhost',
            port: 31416,
            companyName: 'alternatone',
            applicationName: 'alternassist'
        });

        markerPipeline = new MarkerCreationPipeline(ptslManager);
        console.log('PTSL initialized successfully');
    } catch (error) {
        console.error('Failed to initialize PTSL:', error);
    }
}

// Initialize PTSL when app is ready
app.whenReady().then(() => {
    initializePTSL();
});

// ============================================================================
// NoteMarker PTSL IPC Handlers
// ============================================================================

// PTSL Connection
ipcMain.handle('ptsl:connect', async () => {
    try {
        if (!ptslManager) {
            throw new Error('PTSL not initialized');
        }
        await ptslManager.connect();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('ptsl:disconnect', async () => {
    try {
        if (ptslManager) {
            await ptslManager.disconnect();
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('ptsl:getConnectionStatus', async () => {
    try {
        if (!ptslManager) {
            return { connected: false, sessionInfo: null };
        }
        return {
            connected: ptslManager.isConnected(),
            sessionInfo: ptslManager.getSessionInfo()
        };
    } catch (error) {
        return { connected: false, sessionInfo: null, error: error.message };
    }
});

// Session Info
ipcMain.handle('ptsl:getSessionInfo', async () => {
    try {
        if (!ptslManager) {
            throw new Error('PTSL not initialized');
        }
        const sessionInfo = await ptslManager.getSessionInfo();
        return { success: true, data: sessionInfo };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Marker Creation
ipcMain.handle('ptsl:createMarkersFromFile', async (event, filePath) => {
    try {
        if (!markerPipeline) {
            throw new Error('Marker pipeline not initialized');
        }

        // Send progress updates to renderer
        const progressCallback = (progress) => {
            event.sender.send('ptsl:progress', progress);
        };

        const result = await markerPipeline.processFrameIOFile(filePath, progressCallback);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// File dialog for Frame.io TXT files
ipcMain.handle('dialog:openFile', async () => {
    try {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!result.canceled && result.filePaths.length > 0) {
            return { success: true, filePath: result.filePaths[0] };
        }
        return { success: false };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Cleanup on quit
app.on('before-quit', async () => {
    if (ptslManager) {
        try {
            await ptslManager.disconnect();
        } catch (error) {
            console.error('Error disconnecting PTSL:', error);
        }
    }
});
