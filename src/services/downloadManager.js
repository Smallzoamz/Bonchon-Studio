const { ipcMain, BrowserWindow } = require('electron');
const { download } = require('electron-dl');
const extractZip = require('extract-zip');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class DownloadManager {
    constructor() {
        this.downloads = new Map();
        this.setupIpcHandlers();
    }

    setupIpcHandlers() {
        // Start download
        ipcMain.handle('download-app', async (event, { appId, downloadUrl, destinationPath, appName }) => {
            return this.startDownload(event.sender, appId, downloadUrl, destinationPath, appName);
        });

        // Cancel download
        ipcMain.handle('cancel-download', async (event, appId) => {
            return this.cancelDownload(appId);
        });

        // Get download progress
        ipcMain.handle('get-download-progress', (event, appId) => {
            return this.downloads.get(appId) || null;
        });
    }

    async startDownload(webContents, appId, downloadUrl, destinationPath, appName) {
        const win = BrowserWindow.fromWebContents(webContents);

        try {
            // Create destination directory
            if (!fs.existsSync(destinationPath)) {
                fs.mkdirSync(destinationPath, { recursive: true });
            }

            // Track download state
            this.downloads.set(appId, {
                appId,
                appName,
                progress: 0,
                status: 'downloading',
                speed: 0,
                downloaded: 0,
                total: 0
            });

            // Use electron-dl for downloading
            const dl = await download(win, downloadUrl, {
                directory: destinationPath,
                onStarted: (item) => {
                    this.downloads.get(appId).total = item.getTotalBytes();
                },
                onProgress: (progress) => {
                    const state = this.downloads.get(appId);
                    if (state) {
                        state.progress = Math.round(progress.percent * 100);
                        state.downloaded = progress.transferredBytes;
                        state.total = progress.totalBytes;

                        // Send progress to renderer
                        webContents.send('download-progress', {
                            appId,
                            progress: state.progress,
                            downloaded: this.formatBytes(state.downloaded),
                            total: this.formatBytes(state.total),
                            speed: this.formatBytes(state.downloaded / ((Date.now() - state.startTime) / 1000)) + '/s'
                        });
                    }
                },
                onCancel: () => {
                    this.downloads.delete(appId);
                    webContents.send('download-cancelled', { appId });
                }
            });

            const downloadedPath = dl.getSavePath();

            // Update status
            const state = this.downloads.get(appId);
            if (state) {
                state.status = 'extracting';
                state.progress = 100;
                webContents.send('download-progress', { appId, progress: 100, status: 'extracting' });
            }

            // Extract if it's a zip file
            if (downloadedPath.endsWith('.zip')) {
                const extractPath = path.join(destinationPath, appId);
                await this.extractZip(downloadedPath, extractPath);

                // Delete zip file after extraction
                fs.unlinkSync(downloadedPath);

                webContents.send('download-complete', { appId, installPath: extractPath });
                this.downloads.delete(appId);
                return { success: true, installPath: extractPath };
            } else {
                webContents.send('download-complete', { appId, installPath: downloadedPath });
                this.downloads.delete(appId);
                return { success: true, installPath: downloadedPath };
            }

        } catch (error) {
            console.error('Download error:', error);
            this.downloads.delete(appId);
            webContents.send('download-error', { appId, error: error.message });
            return { success: false, error: error.message };
        }
    }

    async extractZip(zipPath, extractPath) {
        try {
            await extractZip(zipPath, { dir: extractPath });
            return true;
        } catch (error) {
            console.error('Extract error:', error);
            throw error;
        }
    }

    cancelDownload(appId) {
        const state = this.downloads.get(appId);
        if (state && state.downloadItem) {
            state.downloadItem.cancel();
        }
        this.downloads.delete(appId);
        return true;
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}

// Fetch app catalog from GitHub
async function fetchAppCatalog(catalogUrl) {
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
        }).on('error', reject);
    });
}

module.exports = { DownloadManager, fetchAppCatalog };
