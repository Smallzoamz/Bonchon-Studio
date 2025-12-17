const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog } = require('electron');
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

// Hide to tray
ipcMain.on('hide-to-tray', () => {
    mainWindow.hide();
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

// Remove installed app (including files)
ipcMain.handle('remove-installed-app', async (event, appId) => {
    try {
        // Get the app folder based on appId directly from settings
        const settings = getSettingsSync();
        const baseDownloadPath = settings.downloadPath || path.join(app.getPath('downloads'), 'Bonchon-Apps');
        const appFolder = path.join(baseDownloadPath, appId);

        console.log('Uninstalling app:', appId);
        console.log('App folder to delete:', appFolder);

        // Kill any running processes from this folder first
        if (fs.existsSync(appFolder)) {
            const { exec } = require('child_process');

            // Find and kill any exe files from this folder
            const killProcesses = () => {
                return new Promise((resolve) => {
                    // Use WMIC to find and kill processes running from this folder
                    const cmd = `wmic process where "ExecutablePath like '${appFolder.replace(/\\/g, '\\\\')}%'" call terminate 2>nul`;
                    exec(cmd, { windowsHide: true }, () => {
                        // Wait a bit for processes to terminate
                        setTimeout(resolve, 1000);
                    });
                });
            };

            await killProcesses();
            console.log('Killed any running processes');

            // Try to delete with retries
            let retries = 3;
            while (retries > 0) {
                try {
                    console.log('Deleting folder (attempt', 4 - retries, '):', appFolder);
                    await fs.promises.rm(appFolder, { recursive: true, force: true });
                    console.log('App folder deleted successfully');
                    break;
                } catch (deleteError) {
                    retries--;
                    if (retries === 0) {
                        console.error('Failed to delete after retries:', deleteError);
                        // Try using rd command as fallback
                        const { execSync } = require('child_process');
                        try {
                            execSync(`rd /s /q "${appFolder}"`, { windowsHide: true });
                            console.log('Deleted using rd command');
                        } catch (rdError) {
                            console.error('rd command also failed:', rdError);
                            throw deleteError;
                        }
                    } else {
                        console.log('Delete failed, retrying in 1 second...');
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }
        } else {
            console.log('App folder not found:', appFolder);
        }

        // Remove from installed apps list
        if (fs.existsSync(installedAppsPath)) {
            let installedApps = JSON.parse(fs.readFileSync(installedAppsPath, 'utf8'));
            installedApps = installedApps.filter(a => a.id !== appId);
            fs.writeFileSync(installedAppsPath, JSON.stringify(installedApps, null, 2));
            console.log('Removed from installed apps list');
        }

        return true;
    } catch (error) {
        console.error('Error removing installed app:', error);
        return false;
    }
});

// Open folder in Explorer
ipcMain.handle('open-folder', async (event, folderPath) => {
    const { shell } = require('electron');
    const normalizedPath = path.normalize(folderPath);
    if (fs.existsSync(normalizedPath)) {
        await shell.openPath(normalizedPath);
        return true;
    }
    return false;
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

// Select download directory
ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'เลือกโฟลเดอร์สำหรับติดตั้งโปรแกรม',
        properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    return result.filePaths[0];
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

// Track active downloads for cancellation
const activeDownloads = new Map(); // appId -> { request, cancelled }

// Get current app version
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// App catalog URL (change this to your GitHub raw URL)
const APP_CATALOG_URL = 'https://raw.githubusercontent.com/Smallzoamz/bonchon-launcher-catalog/main/app-catalog.json';

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

// Fetch GitHub release info for an app
ipcMain.handle('fetch-github-release', async (event, { owner, repo }) => {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${owner}/${repo}/releases/latest`,
            method: 'GET',
            headers: {
                'User-Agent': 'Bonchon-Launcher',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        const release = JSON.parse(data);
                        // Extract version from tag (remove 'v' prefix if exists)
                        const version = release.tag_name.replace(/^v/, '');

                        // Find portable ZIP or EXE asset
                        let downloadUrl = '';
                        let assetName = '';

                        for (const asset of release.assets || []) {
                            const name = asset.name.toLowerCase();
                            // Prefer portable ZIP
                            if (name.includes('portable') && name.endsWith('.zip')) {
                                downloadUrl = asset.browser_download_url;
                                assetName = asset.name;
                                break;
                            }
                            // Fallback to any ZIP
                            if (name.endsWith('.zip') && !downloadUrl) {
                                downloadUrl = asset.browser_download_url;
                                assetName = asset.name;
                            }
                            // Or EXE if no ZIP found
                            if (name.endsWith('.exe') && !downloadUrl) {
                                downloadUrl = asset.browser_download_url;
                                assetName = asset.name;
                            }
                        }

                        resolve({
                            version,
                            downloadUrl,
                            assetName,
                            publishedAt: release.published_at,
                            releaseNotes: release.body || ''
                        });
                    } else if (res.statusCode === 404) {
                        resolve(null); // No releases found
                    } else {
                        console.error('GitHub API error:', res.statusCode, data);
                        resolve(null);
                    }
                } catch (e) {
                    console.error('Parse GitHub release error:', e);
                    resolve(null);
                }
            });
        });

        req.on('error', (err) => {
            console.error('GitHub API request error:', err);
            resolve(null); // Don't reject, just return null
        });

        req.end();
    });
});

// Real download with progress
async function performDownload(appId, downloadUrl, appName, originalFileName = null) {
    const settings = getSettingsSync();
    const downloadPath = settings.downloadPath || path.join(app.getPath('downloads'), 'Bonchon-Apps');
    const appPath = path.join(downloadPath, appId);

    // Create directory
    if (!fs.existsSync(appPath)) {
        fs.mkdirSync(appPath, { recursive: true });
    }

    // Extract filename from URL (remove query params)
    let fileName = originalFileName;
    if (!fileName) {
        const urlWithoutParams = downloadUrl.split('?')[0];
        fileName = path.basename(urlWithoutParams);
        // If still no valid filename, use appId
        if (!fileName || fileName.length < 3) {
            fileName = `${appId}-setup.exe`;
        }
    }
    const filePath = path.join(appPath, fileName);

    // Track this download
    activeDownloads.set(appId, { request: null, cancelled: false });

    return new Promise((resolve, reject) => {
        const protocol = downloadUrl.startsWith('https') ? https : http;

        const request = protocol.get(downloadUrl, (response) => {
            // Store the request for cancellation
            activeDownloads.set(appId, { request, cancelled: false });
            // Handle redirects - pass original filename
            if (response.statusCode === 302 || response.statusCode === 301) {
                const redirectUrl = response.headers.location;
                console.log('Redirecting to:', redirectUrl.substring(0, 100) + '...');
                return performDownload(appId, redirectUrl, appName, fileName)
                    .then(resolve)
                    .catch(reject);
            }

            const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
            let downloadedBytes = 0;
            const startTime = Date.now();

            const file = fs.createWriteStream(filePath);

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
                const elapsedTime = (Date.now() - startTime) / 1000;
                const speed = downloadedBytes / elapsedTime;

                // Send progress to renderer
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('download-progress', {
                        appId,
                        progress,
                        downloaded: formatBytes(downloadedBytes),
                        total: formatBytes(totalBytes),
                        speed: formatBytes(speed) + '/s'
                    });
                }
            });

            response.pipe(file);

            file.on('finish', async () => {
                file.close();

                // Check if download was cancelled
                const downloadInfo = activeDownloads.get(appId);
                if (downloadInfo && downloadInfo.cancelled) {
                    console.log('Download was cancelled, cleaning up:', appId);
                    // Clean up the downloaded file
                    try {
                        fs.unlinkSync(filePath);
                    } catch (e) { }
                    activeDownloads.delete(appId);
                    resolve({ success: false, cancelled: true });
                    return;
                }

                // Send installing status
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('download-progress', {
                        appId,
                        progress: 100,
                        status: 'installing'
                    });
                }

                let finalInstallPath = appPath;

                // Helper function to find main executable (async to not block event loop)
                const findMainExeAsync = async (dir, depth = 0) => {
                    if (depth > 5) return null;
                    try {
                        // Check if directory exists
                        await fs.promises.access(dir);
                        const files = await fs.promises.readdir(dir);
                        const exeFiles = [];
                        const subdirs = [];

                        for (const file of files) {
                            // Yield to event loop periodically
                            await new Promise(resolve => setImmediate(resolve));

                            // Check if cancelled
                            const dlCheck = activeDownloads.get(appId);
                            if (dlCheck && dlCheck.cancelled) return null;

                            const fullPath = path.join(dir, file);
                            try {
                                const stat = await fs.promises.stat(fullPath);
                                if (stat.isDirectory()) {
                                    subdirs.push(fullPath);
                                } else if (file.endsWith('.exe') &&
                                    !file.toLowerCase().includes('uninstall') &&
                                    !file.toLowerCase().includes('uninst') &&
                                    !file.toLowerCase().includes('update') &&
                                    !file.toLowerCase().includes('helper') &&
                                    !file.toLowerCase().includes('crash')) {
                                    exeFiles.push(fullPath);
                                }
                            } catch (e) { }
                        }

                        // Return first valid exe found at current level
                        if (exeFiles.length > 0) {
                            return exeFiles[0];
                        }

                        // Search subdirectories
                        for (const subdir of subdirs) {
                            const found = await findMainExeAsync(subdir, depth + 1);
                            if (found) return found;
                        }
                    } catch (e) { }
                    return null;
                };

                // Extract ZIP file (like Epic Games Store)
                if (filePath.endsWith('.zip')) {
                    try {
                        console.log('Extracting ZIP:', filePath);
                        console.log('Extract to:', appPath);

                        // Send extracting status
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('download-progress', {
                                appId,
                                progress: 100,
                                status: 'extracting'
                            });
                        }

                        // Check cancellation before extraction
                        const downloadCheck = activeDownloads.get(appId);
                        if (downloadCheck && downloadCheck.cancelled) {
                            console.log('Download cancelled before extraction');
                            try { await fs.promises.unlink(filePath); } catch (e) { }
                            activeDownloads.delete(appId);
                            resolve({ success: false, cancelled: true });
                            return;
                        }

                        // Use PowerShell to extract ZIP (non-blocking child process)
                        const { spawn } = require('child_process');

                        const extractWithPowerShell = () => {
                            return new Promise((resolveExtract, rejectExtract) => {
                                const psCommand = `Expand-Archive -Path "${filePath}" -DestinationPath "${appPath}" -Force`;
                                console.log('Running PowerShell:', psCommand);

                                const ps = spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], {
                                    windowsHide: true
                                });

                                // Store process for cancellation
                                const dlInfo = activeDownloads.get(appId);
                                if (dlInfo) dlInfo.extractProcess = ps;

                                let errorOutput = '';

                                ps.stderr.on('data', (data) => {
                                    errorOutput += data.toString();
                                    console.log('PowerShell stderr:', data.toString());
                                });

                                ps.stdout.on('data', (data) => {
                                    console.log('PowerShell stdout:', data.toString());
                                });

                                ps.on('close', (code) => {
                                    console.log('PowerShell exited with code:', code);
                                    if (code === 0) {
                                        resolveExtract();
                                    } else {
                                        rejectExtract(new Error(`Extraction failed with code ${code}: ${errorOutput}`));
                                    }
                                });

                                ps.on('error', (err) => {
                                    console.error('PowerShell error:', err);
                                    rejectExtract(err);
                                });
                            });
                        };

                        // Start extraction progress animation
                        let extractProgress = 0;
                        const progressInterval = setInterval(() => {
                            // Check cancellation
                            const dlCheck = activeDownloads.get(appId);
                            if (dlCheck && dlCheck.cancelled) {
                                clearInterval(progressInterval);
                                if (dlCheck.extractProcess) {
                                    dlCheck.extractProcess.kill();
                                }
                                return;
                            }

                            // Animate progress (slower as it approaches 95%)
                            if (extractProgress < 95) {
                                extractProgress += Math.max(1, (95 - extractProgress) * 0.1);
                            }

                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('download-progress', {
                                    appId,
                                    progress: 100,
                                    status: 'extracting',
                                    extractProgress: Math.round(extractProgress)
                                });
                            }
                        }, 500);

                        await extractWithPowerShell();
                        clearInterval(progressInterval);

                        console.log('Extraction complete!');

                        // Check cancellation after extraction
                        const postExtractCheck = activeDownloads.get(appId);
                        if (postExtractCheck && postExtractCheck.cancelled) {
                            console.log('Download cancelled after extraction');
                            activeDownloads.delete(appId);
                            resolve({ success: false, cancelled: true });
                            return;
                        }

                        // Remove ZIP after extract
                        try {
                            await fs.promises.unlink(filePath);
                            console.log('Removed ZIP file');
                        } catch (e) { }

                        // Find main executable (async)
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('download-progress', {
                                appId,
                                progress: 100,
                                status: 'installing'
                            });
                        }

                        const mainExe = await findMainExeAsync(appPath);
                        if (mainExe) {
                            finalInstallPath = mainExe;
                            console.log('Found main exe:', mainExe);
                        } else {
                            console.log('No exe found in extracted files');
                        }
                    } catch (extractError) {
                        console.error('Extract error:', extractError);
                        activeDownloads.delete(appId);
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('download-error', {
                                appId,
                                error: 'การแตกไฟล์ล้มเหลว: ' + extractError.message
                            });
                        }
                        reject(extractError);
                        return;
                    }
                }
                // EXE file - treat as portable app (ready to use)
                else if (filePath.endsWith('.exe')) {
                    // This is a portable EXE, just use it directly
                    finalInstallPath = filePath;
                    console.log('Portable EXE ready:', filePath);
                }

                // Clean up active downloads tracking
                activeDownloads.delete(appId);

                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('download-complete', {
                        appId,
                        installPath: finalInstallPath
                    });
                }

                resolve({ success: true, installPath: finalInstallPath });
            });
        });

        request.on('error', (err) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('download-error', {
                    appId,
                    error: err.message
                });
            }
            reject(err);
        });
    });
}

ipcMain.handle('download-app', async (event, { appId, downloadUrl, appName }) => {
    return performDownload(appId, downloadUrl, appName);
});

// Cancel download
ipcMain.handle('cancel-download', async (event, appId) => {
    const download = activeDownloads.get(appId);
    if (download) {
        download.cancelled = true;
        if (download.request) {
            download.request.destroy();
        }
        activeDownloads.delete(appId);

        // Notify renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-cancelled', { appId });
        }

        console.log('Download cancelled:', appId);
        return true;
    }
    return false;
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
