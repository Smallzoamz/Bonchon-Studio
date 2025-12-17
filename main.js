const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;
let isQuitting = false;

// App paths
const userDataPath = app.getPath('userData');
const installedAppsPath = path.join(userDataPath, 'installed-apps.json');
const settingsPath = path.join(userDataPath, 'settings.json');

// Get settings synchronously
function getSettingsSync() {
    try {
        if (fs.existsSync(settingsPath)) {
            return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading settings:', error);
    }
    return {
        downloadPath: path.join(app.getPath('downloads'), 'Bonchon-Apps'),
        theme: 'dark',
        autoStart: false,
        minimizeToTray: true
    };
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        frame: false,
        transparent: false,
        backgroundColor: '#0a0a0f',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'src', 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'icons', 'logo.png'),
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Handle close to tray
    mainWindow.on('close', (event) => {
        const settings = getSettingsSync();
        if (!isQuitting && settings.minimizeToTray) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
    });

    // Open DevTools in development
    // mainWindow.webContents.openDevTools();
}

function createTray() {
    // Create tray icon
    const iconPath = path.join(__dirname, 'assets', 'icons', 'logo.png');
    let trayIcon;

    try {
        trayIcon = nativeImage.createFromPath(iconPath);
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } catch (e) {
        // Fallback if icon not found
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'เปิด Bonchon Launcher',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            }
        },
        { type: 'separator' },
        {
            label: 'ออกจากโปรแกรม',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Bonchon Launcher');
    tray.setContextMenu(contextMenu);

    // Double click to show window
    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
    });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

app.whenReady().then(() => {
    createWindow();
    createTray();

    // Apply auto-start setting
    const settings = getSettingsSync();
    app.setLoginItemSettings({
        openAtLogin: settings.autoStart || false,
        path: app.getPath('exe')
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        mainWindow.show();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});

// IPC Handlers
ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('window-close', () => {
    mainWindow.close();
});

// Get installed apps
ipcMain.handle('get-installed-apps', () => {
    try {
        if (fs.existsSync(installedAppsPath)) {
            return JSON.parse(fs.readFileSync(installedAppsPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading installed apps:', error);
    }
    return [];
});

// Save installed app
ipcMain.handle('save-installed-app', (event, appData) => {
    try {
        let installedApps = [];
        if (fs.existsSync(installedAppsPath)) {
            installedApps = JSON.parse(fs.readFileSync(installedAppsPath, 'utf8'));
        }

        // Check if already installed (update if exists)
        const existingIndex = installedApps.findIndex(a => a.id === appData.id);
        if (existingIndex >= 0) {
            // Update existing - keep install date, update version
            installedApps[existingIndex] = {
                ...installedApps[existingIndex],
                ...appData,
                installedAt: installedApps[existingIndex].installedAt,
                updatedAt: new Date().toISOString()
            };
        } else {
            installedApps.push(appData);
        }

        fs.writeFileSync(installedAppsPath, JSON.stringify(installedApps, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving installed app:', error);
        return false;
    }
});

// Remove installed app
ipcMain.handle('remove-installed-app', (event, appId) => {
    try {
        if (fs.existsSync(installedAppsPath)) {
            let installedApps = JSON.parse(fs.readFileSync(installedAppsPath, 'utf8'));
            installedApps = installedApps.filter(a => a.id !== appId);
            fs.writeFileSync(installedAppsPath, JSON.stringify(installedApps, null, 2));
        }
        return true;
    } catch (error) {
        console.error('Error removing installed app:', error);
        return false;
    }
});

// Get settings
ipcMain.handle('get-settings', () => {
    return getSettingsSync();
});

// Save settings
ipcMain.handle('save-settings', (event, settings) => {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Apply auto-start setting immediately
        app.setLoginItemSettings({
            openAtLogin: settings.autoStart || false,
            path: app.getPath('exe')
        });

        return true;
    } catch (error) {
        console.error('Error saving settings:', error);
        return false;
    }
});

// Open external link
ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

// Launch application
ipcMain.handle('launch-app', (event, appPath) => {
    try {
        shell.openPath(appPath);
        return true;
    } catch (error) {
        console.error('Error launching app:', error);
        return false;
    }
});

// Force quit app (from renderer)
ipcMain.on('force-quit', () => {
    isQuitting = true;
    app.quit();
});

// ========================================
// REAL DOWNLOAD SYSTEM
// ========================================
const https = require('https');
const http = require('http');

// App catalog URL (change this to your GitHub raw URL)
const APP_CATALOG_URL = 'https://raw.githubusercontent.com/YourUsername/bonchon-launcher-catalog/main/app-catalog.json';

// Fetch app catalog from GitHub
ipcMain.handle('fetch-app-catalog', async (event, url) => {
    const catalogUrl = url || APP_CATALOG_URL;

    return new Promise((resolve, reject) => {
        const protocol = catalogUrl.startsWith('https') ? https : http;

        protocol.get(catalogUrl, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', (err) => {
            console.error('Fetch catalog error:', err);
            reject(err);
        });
    });
});

// Real download with progress
ipcMain.handle('download-app', async (event, { appId, downloadUrl, appName }) => {
    const settings = getSettingsSync();
    const downloadPath = settings.downloadPath || path.join(app.getPath('downloads'), 'Bonchon-Apps');
    const appPath = path.join(downloadPath, appId);

    // Create directory
    if (!fs.existsSync(appPath)) {
        fs.mkdirSync(appPath, { recursive: true });
    }

    const fileName = path.basename(downloadUrl);
    const filePath = path.join(appPath, fileName);

    return new Promise((resolve, reject) => {
        const protocol = downloadUrl.startsWith('https') ? https : http;

        const request = protocol.get(downloadUrl, (response) => {
            // Handle redirects
            if (response.statusCode === 302 || response.statusCode === 301) {
                return ipcMain.handle('download-app', event, {
                    appId,
                    downloadUrl: response.headers.location,
                    appName
                }).then(resolve).catch(reject);
            }

            const totalBytes = parseInt(response.headers['content-length'], 10);
            let downloadedBytes = 0;
            const startTime = Date.now();

            const file = fs.createWriteStream(filePath);

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                const progress = Math.round((downloadedBytes / totalBytes) * 100);
                const elapsedTime = (Date.now() - startTime) / 1000;
                const speed = downloadedBytes / elapsedTime;

                // Send progress to renderer
                mainWindow.webContents.send('download-progress', {
                    appId,
                    progress,
                    downloaded: formatBytes(downloadedBytes),
                    total: formatBytes(totalBytes),
                    speed: formatBytes(speed) + '/s'
                });
            });

            response.pipe(file);

            file.on('finish', async () => {
                file.close();

                // Send extracting status
                mainWindow.webContents.send('download-progress', {
                    appId,
                    progress: 100,
                    status: 'extracting'
                });

                // Extract if zip
                if (filePath.endsWith('.zip')) {
                    try {
                        const extractZip = require('extract-zip');
                        await extractZip(filePath, { dir: appPath });
                        fs.unlinkSync(filePath); // Remove zip after extract
                    } catch (extractError) {
                        console.error('Extract error:', extractError);
                    }
                }

                mainWindow.webContents.send('download-complete', {
                    appId,
                    installPath: appPath
                });

                resolve({ success: true, installPath: appPath });
            });
        });

        request.on('error', (err) => {
            mainWindow.webContents.send('download-error', {
                appId,
                error: err.message
            });
            reject(err);
        });
    });
});

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ========================================
// AUTO-UPDATER (for Launcher itself)
// ========================================
// Uncomment and configure when ready to publish
/*
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

ipcMain.handle('check-for-updates', async () => {
    try {
        const result = await autoUpdater.checkForUpdates();
        return result;
    } catch (error) {
        console.error('Update check error:', error);
        return null;
    }
});

autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update-progress', progress);
});

autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update-downloaded', info);
});

ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});
*/
