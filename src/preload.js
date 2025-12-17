const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),

    // App management
    getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),
    saveInstalledApp: (appData) => ipcRenderer.invoke('save-installed-app', appData),
    removeInstalledApp: (appId) => ipcRenderer.invoke('remove-installed-app', appId),
    launchApp: (appPath) => ipcRenderer.invoke('launch-app', appPath),

    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),

    // External links
    openExternal: (url) => ipcRenderer.send('open-external', url),

    // Force quit
    forceQuit: () => ipcRenderer.send('force-quit'),

    // Hide to tray
    hideToTray: () => ipcRenderer.send('hide-to-tray'),

    // Open folder in Explorer
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),

    // Real download system
    downloadApp: (options) => ipcRenderer.invoke('download-app', options),
    cancelDownload: (appId) => ipcRenderer.invoke('cancel-download', appId),

    // Download events
    onDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (event, data) => callback(data));
    },
    onDownloadComplete: (callback) => {
        ipcRenderer.on('download-complete', (event, data) => callback(data));
    },
    onDownloadError: (callback) => {
        ipcRenderer.on('download-error', (event, data) => callback(data));
    },
    onDownloadCancelled: (callback) => {
        ipcRenderer.on('download-cancelled', (event, data) => callback(data));
    },

    // App catalog
    fetchAppCatalog: (url) => ipcRenderer.invoke('fetch-app-catalog', url),

    // Launcher updates
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', (event, data) => callback(data));
    },
    onUpdateProgress: (callback) => {
        ipcRenderer.on('update-progress', (event, data) => callback(data));
    },
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', (event, data) => callback(data));
    },
    installUpdate: () => ipcRenderer.send('install-update')
});
