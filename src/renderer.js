
// ========================================
// BONCHON LAUNCHER - RENDERER
// ========================================

// App Catalog URL - Change this to your GitHub raw URL
const APP_CATALOG_URL = 'https://raw.githubusercontent.com/Smallzoamz/bonchon-launcher-catalog/main/app-catalog.json';

// App catalog data (loaded from API)
let appsData = [];

// Fallback data if API fails
const fallbackAppsData = [
    {
        id: "fivem-launcher",
        name: "FiveM Launcher",
        description: "Custom launcher สำหรับ FiveM พร้อมระบบเลือก Pure Mode ที่สะดวกและรวดเร็ว",
        icon: "../assets/icons/logo.png",
        version: "1.0.0",
        downloadUrl: "",
        githubRepo: "Smallzoamz/FiveMLauncher",
        size: "45 MB",
        category: "Gaming",
        bgColor: "linear-gradient(135deg, #ff6b35 0%, #f7931e 50%, #ff4500 100%)"
    },
    {
        id: "medic-recruitment",
        name: "Medic OP Systems",
        description: "ระบบจัดการ OP และติดตามสถานะ Medic แบบ Real-time",
        icon: "../assets/icons/logo.png",
        version: "1.0.0",
        downloadUrl: "",
        githubRepo: "Smallzoamz/medicop",
        size: "82 MB",
        category: "Management",
        bgColor: "linear-gradient(135deg, #00d4ff 0%, #0099cc 50%, #006699 100%)"
    }
];

// State
let installedApps = [];
let currentPage = 'store';
let selectedApp = null;
let downloadQueue = [];
let isDownloading = false;
let currentDownloadInterval = null;
let useRealDownload = true; // Toggle for real vs simulated download
let settings = {
    downloadPath: '',
    theme: 'dark'
};

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadInstalledApps();
    await loadAppCatalog(); // Load apps from GitHub

    // Sync all versions from GitHub before rendering
    await syncAllAppVersions();

    initNavigation();
    initWindowControls();
    initDownloadListeners(); // Setup download event listeners
    renderStorePage();
    renderLibraryPage();
    updateSettingsDisplay();

    // Check for updates on installed apps (now uses already synced data)
    checkForAppUpdates();

    // Check for launcher updates
    await checkLauncherUpdate();

    // Hide splash screen after a short delay
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('hidden');
            // Remove from DOM after animation
            setTimeout(() => splash.remove(), 500);
        }
    }, 1500);
});

// Check for updates on installed apps (Syncs with already updated appsData)
function checkForAppUpdates() {
    const appsWithUpdates = [];

    for (const installed of installedApps) {
        const catalogApp = appsData.find(a => a.id === installed.id);
        if (!catalogApp) continue;

        // Compare current versions in catalog (which should already be synced from GitHub)
        if (catalogApp.version !== installed.version) {
            appsWithUpdates.push({
                name: catalogApp.name,
                currentVersion: installed.version,
                newVersion: catalogApp.version
            });
        }
    }

    if (appsWithUpdates.length > 0) {
        const updateList = appsWithUpdates.map(app =>
            `• ${app.name}: v${app.currentVersion} → v${app.newVersion}`
        ).join('\n');

        console.log('Updates available:', appsWithUpdates);

        // Show notification after splash screen
        setTimeout(() => {
            showAlert(
                'มีอัพเดทใหม่!',
                `พบการอัพเดทสำหรับ ${appsWithUpdates.length} โปรแกรม:\n${updateList}\n\nไปที่ Library เพื่ออัพเดท`,
                'info'
            );
        }, 2000);
    }
}

// Sync all app versions from GitHub
async function syncAllAppVersions() {
    console.log('Syncing all app versions with GitHub...');
    const syncPromises = appsData.map(async (app) => {
        if (app.githubRepo) {
            try {
                const [owner, repo] = app.githubRepo.split('/');
                const release = await window.electronAPI.fetchGitHubRelease({ owner, repo });
                if (release && release.version) {
                    app.version = release.version;
                    app.downloadUrl = release.downloadUrl || app.downloadUrl;
                    console.log(`Synced ${app.name} to v${app.version}`);
                }
            } catch (error) {
                console.warn(`Failed to sync ${app.name}:`, error);
            }
        }
    });

    await Promise.all(syncPromises);
}

// Load app catalog from GitHub
async function loadAppCatalog() {
    try {
        const catalog = await window.electronAPI.fetchAppCatalog(APP_CATALOG_URL);
        if (catalog && catalog.apps) {
            appsData = catalog.apps;
            console.log('Loaded app catalog:', appsData.length, 'apps');
        }
    } catch (error) {
        console.warn('Failed to load app catalog, using fallback:', error);
        appsData = fallbackAppsData;
    }
}

// Setup download event listeners
function initDownloadListeners() {
    // Real download progress from main process
    window.electronAPI.onDownloadProgress((data) => {
        const { appId, progress, downloaded, total, speed, status, extractProgress, currentFile } = data;

        // Update modal
        const progressEl = document.getElementById('download-progress');
        const percentEl = document.getElementById('download-percent');
        const statusEl = document.getElementById('download-status');
        const speedEl = document.getElementById('download-speed');

        if (progressEl) progressEl.style.width = `${progress}%`;
        if (percentEl) percentEl.textContent = `${progress}%`;
        if (statusEl) {
            if (status === 'installing') {
                statusEl.textContent = 'กำลังติดตั้ง...';
            } else if (status === 'extracting') {
                // Show extraction progress with more path segments
                const fileName = currentFile || '';
                const progressText = extractProgress ? ` (${extractProgress}%)` : '';
                statusEl.textContent = `กำลังแตกไฟล์${progressText}: ${fileName || '...'}`;
            } else {
                statusEl.textContent = 'กำลังดาวน์โหลด...';
            }
        }
        if (speedEl && speed) speedEl.textContent = speed;

        // Update background widget
        const queueItem = downloadQueue.find(d => d.id === appId);
        if (queueItem) {
            queueItem.progress = progress;
            updateBackgroundDownloadWidget();
        }
    });

    window.electronAPI.onDownloadComplete(async (data) => {
        const { appId, installPath } = data;
        const app = appsData.find(a => a.id === appId);

        if (app) {
            // Save to installed apps
            const appData = {
                id: app.id,
                name: app.name,
                version: app.version,
                installedAt: new Date().toISOString(),
                path: installPath
            };

            await window.electronAPI.saveInstalledApp(appData);
            await loadInstalledApps();

            // Update UI
            const statusEl = document.getElementById('download-status');
            if (statusEl) statusEl.textContent = 'ติดตั้งเสร็จสมบูรณ์!';

            // Remove from queue and hide widget
            downloadQueue = downloadQueue.filter(d => d.id !== appId);
            isDownloading = false;
            updateBackgroundDownloadWidget();

            // Hide background widget immediately
            const widget = document.getElementById('bg-download-widget');
            if (widget && downloadQueue.length === 0) {
                widget.classList.add('hidden');
            }

            // Close modal and refresh UI (no auto-launch)
            setTimeout(() => {
                document.getElementById('download-modal').classList.remove('active');
                renderStorePage();
                renderLibraryPage();
                showAlert('ติดตั้งสำเร็จ', `${app.name} ติดตั้งเสร็จเรียบร้อยแล้ว`, 'info');
            }, 1000);
        }
    });

    window.electronAPI.onDownloadError((data) => {
        const { appId, error } = data;
        console.error('Download error:', error);
        showAlert('ดาวน์โหลดล้มเหลว', error, 'danger');

        downloadQueue = downloadQueue.filter(d => d.id !== appId);
        isDownloading = false;
        updateBackgroundDownloadWidget();
        document.getElementById('download-modal').classList.remove('active');
    });

    // Handle download cancellation from main process
    window.electronAPI.onDownloadCancelled((data) => {
        const { appId } = data;
        console.log('Download cancelled:', appId);

        downloadQueue = downloadQueue.filter(d => d.id !== appId);
        isDownloading = false;
        updateBackgroundDownloadWidget();
        document.getElementById('download-modal').classList.remove('active');

        // Hide background widget if empty
        const widget = document.getElementById('bg-download-widget');
        if (widget && downloadQueue.length === 0) {
            widget.classList.add('hidden');
        }
    });
}

// ========================================
// NAVIGATION
// ========================================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(pageName) {
    // Clear background when navigating
    clearBackground();

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        }
    });

    // Update pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    const targetPage = document.getElementById(`page-${pageName}`);
    if (targetPage) {
        targetPage.classList.add('active');
    }

    currentPage = pageName;

    // Refresh content if needed
    if (pageName === 'library') {
        renderLibraryPage();
    }
}

// ========================================
// WINDOW CONTROLS
// ========================================
function initWindowControls() {
    document.getElementById('btn-minimize').addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
    });

    document.getElementById('btn-maximize').addEventListener('click', () => {
        window.electronAPI.maximizeWindow();
    });

    document.getElementById('btn-close').addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });
}

// ========================================
// DATA LOADING
// ========================================
async function loadSettings() {
    try {
        settings = await window.electronAPI.getSettings();
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function loadInstalledApps() {
    try {
        installedApps = await window.electronAPI.getInstalledApps();
    } catch (error) {
        console.error('Error loading installed apps:', error);
        installedApps = [];
    }
}

// ========================================
// STORE PAGE
// ========================================
function renderStorePage() {
    const grid = document.getElementById('store-grid');
    grid.innerHTML = '';

    appsData.forEach(app => {
        const isInstalled = installedApps.some(a => a.id === app.id);
        const card = createAppCard(app, isInstalled, 'store');
        grid.appendChild(card);
    });
}

function createAppCard(app, isInstalled, context) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.appId = app.id;

    // Use app icon if available, otherwise use Bonchon Studio logo
    const iconUrl = app.icon || app.iconUrl || '../assets/icons/logo.png';
    const iconElement = `<img src="${iconUrl}" alt="${app.name}" style="width: 80px; height: 80px; object-fit: contain; border-radius: 16px;" onerror="this.src='../assets/icons/logo.png'">`;

    card.innerHTML = `
        <div class="app-card-image">
            <div class="app-icon-wrapper">
                ${iconElement}
            </div>
        </div>
        <div class="app-card-content">
            <h3 class="app-card-name">${app.name}</h3>
            <p class="app-card-desc">${app.description}</p>
            <div class="app-card-footer">
                <span class="app-version">v${app.version}</span>
                ${context === 'store' ? getStoreButton(app, isInstalled) : getLibraryButtons(app)}
            </div>
        </div>
    `;

    // Add click handler for background change
    card.addEventListener('click', (e) => {
        // Don't trigger if clicking on buttons
        if (e.target.closest('.btn')) return;
        selectApp(app);
    });

    return card;
}

// Select app and update background
function selectApp(app) {
    selectedApp = app;

    // Update card selection
    document.querySelectorAll('.app-card').forEach(card => {
        card.classList.remove('selected');
        if (card.dataset.appId === app.id) {
            card.classList.add('selected');
        }
    });

    // Update background
    const bgImage = document.getElementById('bg-image');
    if (bgImage && app.bgColor) {
        bgImage.style.background = app.bgColor;
        bgImage.classList.add('active');
    }
}

// Clear background when navigating
function clearBackground() {
    selectedApp = null;
    document.querySelectorAll('.app-card').forEach(card => {
        card.classList.remove('selected');
    });
    const bgImage = document.getElementById('bg-image');
    if (bgImage) {
        bgImage.classList.remove('active');
    }
}

function getStoreButton(app, isInstalled) {
    if (isInstalled) {
        return `<span class="app-status installed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            Installed
        </span>`;
    }

    return `<button class="btn btn-primary btn-sm" onclick="downloadApp('${app.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
    </button>`;
}

function getLibraryButtons(app) {
    // Check if update is available by comparing versions
    const catalogApp = appsData.find(a => a.id === app.id);
    const installedApp = installedApps.find(a => a.id === app.id);
    const hasUpdate = catalogApp && installedApp && catalogApp.version !== installedApp.version;

    return `
        <div class="library-buttons">
            <!-- Progress overlay (hidden by default) -->
            <div class="card-progress-overlay" id="progress-${app.id}" style="display: none;">
                <div class="circular-progress" id="circular-${app.id}">
                    <svg viewBox="0 0 36 36">
                        <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                        <path class="circle" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                    </svg>
                    <span class="progress-text">0%</span>
                </div>
            </div>
            
            <div class="button-row">
                ${hasUpdate ? `
                    <button class="btn btn-primary btn-sm" onclick="updateApp('${app.id}')" title="อัพเดท">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Update
                    </button>
                ` : ''}
                <button class="btn btn-success btn-sm" onclick="launchApp('${app.id}')" title="เปิดโปรแกรม">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Launch
                </button>
            </div>
            <div class="button-row secondary">
                <button class="btn btn-icon btn-sm" onclick="openAppFolder('${app.id}')" title="เปิดโฟลเดอร์">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                </button>
                <button class="btn btn-icon btn-sm" onclick="repairApp('${app.id}')" title="ซ่อมไฟล์">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                    </svg>
                </button>
                <button class="btn btn-icon btn-danger btn-sm" onclick="uninstallApp('${app.id}')" title="ถอนการติดตั้ง">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

// ========================================
// LIBRARY PAGE
// ========================================
function renderLibraryPage() {
    const grid = document.getElementById('library-grid');
    const emptyState = document.getElementById('library-empty');

    grid.innerHTML = '';

    if (installedApps.length === 0) {
        grid.style.display = 'none';
        emptyState.classList.add('visible');
        return;
    }

    grid.style.display = 'grid';
    emptyState.classList.remove('visible');

    installedApps.forEach(app => {
        // Merge with full app data
        const fullApp = appsData.find(a => a.id === app.id) || app;
        const card = createAppCard({ ...fullApp, ...app }, true, 'library');
        grid.appendChild(card);
    });
}

// ========================================
// APP ACTIONS
// ========================================
async function downloadApp(appId) {
    const app = appsData.find(a => a.id === appId);
    if (!app) return;

    // Check if already in queue
    if (downloadQueue.some(d => d.id === appId)) {
        await showAlert('กำลังดาวน์โหลด', `${app.name} อยู่ในคิวดาวน์โหลดแล้ว`, 'info');
        return;
    }

    // Add to download queue
    const downloadItem = {
        id: app.id,
        name: app.name,
        app: app,
        progress: 0
    };
    downloadQueue.push(downloadItem);
    updateBackgroundDownloadWidget();

    // Show download modal
    const modal = document.getElementById('download-modal');
    const appName = document.getElementById('download-app-name');
    const status = document.getElementById('download-status');
    const progress = document.getElementById('download-progress');
    const percent = document.getElementById('download-percent');
    const speed = document.getElementById('download-speed');

    appName.textContent = app.name;
    status.textContent = 'กำลังเตรียมดาวน์โหลด...';
    progress.style.width = '0%';
    percent.textContent = '0%';
    speed.textContent = '-';

    modal.classList.add('active');
    isDownloading = true;

    // Check if we have a real download URL
    if (useRealDownload && app.downloadUrl) {
        // Use real download
        try {
            await window.electronAPI.downloadApp({
                appId: app.id,
                downloadUrl: app.downloadUrl,
                appName: app.name
            });
            // Progress and completion handled by event listeners
        } catch (error) {
            console.error('Download failed:', error);
            await showAlert('ดาวน์โหลดล้มเหลว', error.message || 'เกิดข้อผิดพลาด', 'danger');
            modal.classList.remove('active');
            isDownloading = false;
            downloadQueue = downloadQueue.filter(d => d.id !== app.id);
            updateBackgroundDownloadWidget();
        }
    } else {
        // Simulate download progress (for testing or when no URL)
        let currentProgress = 0;
        currentDownloadInterval = setInterval(() => {
            currentProgress += Math.random() * 15;
            if (currentProgress >= 100) {
                currentProgress = 100;
                clearInterval(currentDownloadInterval);
                currentDownloadInterval = null;
                completeDownload(app);
            }

            // Update modal
            progress.style.width = `${currentProgress}%`;
            percent.textContent = `${Math.round(currentProgress)}%`;
            status.textContent = currentProgress < 100 ? 'กำลังดาวน์โหลด...' : 'กำลังติดตั้ง...';
            speed.textContent = `${(Math.random() * 10 + 5).toFixed(1)} MB/s`;

            // Update queue item
            const queueItem = downloadQueue.find(d => d.id === app.id);
            if (queueItem) {
                queueItem.progress = Math.round(currentProgress);
                updateBackgroundDownloadWidget();
            }
        }, 300);
    }

    // Cancel button
    document.getElementById('btn-cancel-download').onclick = async () => {
        // Cancel simulated download if running
        if (currentDownloadInterval) clearInterval(currentDownloadInterval);
        currentDownloadInterval = null;

        // Cancel real download in main process
        await window.electronAPI.cancelDownload(app.id);

        modal.classList.remove('active');
        isDownloading = false;
        downloadQueue = downloadQueue.filter(d => d.id !== app.id);
        updateBackgroundDownloadWidget();

        // Hide background widget if empty
        const widget = document.getElementById('bg-download-widget');
        if (widget && downloadQueue.length === 0) {
            widget.classList.add('hidden');
        }
    };

    // Minimize to background button
    document.getElementById('btn-minimize-download').onclick = () => {
        modal.classList.remove('active');
        document.getElementById('bg-download-widget').classList.remove('hidden');
    };

    // Expand from background
    document.getElementById('btn-expand-download').onclick = () => {
        if (isDownloading) {
            modal.classList.add('active');
        }
    };
}

function updateBackgroundDownloadWidget() {
    const widget = document.getElementById('bg-download-widget');
    const list = document.getElementById('bg-download-list');

    if (downloadQueue.length === 0) {
        widget.classList.add('hidden');
        return;
    }

    list.innerHTML = downloadQueue.map(item => `
        <div class="bg-download-item" data-id="${item.id}">
            <div class="bg-download-item-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="4"/>
                </svg>
            </div>
            <div class="bg-download-item-info">
                <div class="bg-download-item-name">${item.name}</div>
                <div class="bg-download-item-progress">
                    <div class="bg-download-item-progress-fill" style="width: ${item.progress}%"></div>
                </div>
            </div>
            <div class="bg-download-item-percent">${item.progress}%</div>
        </div>
    `).join('');
}

async function completeDownload(app) {
    const status = document.getElementById('download-status');
    status.textContent = 'ติดตั้งเสร็จสมบูรณ์!';

    // Save to installed apps
    const appData = {
        id: app.id,
        name: app.name,
        version: app.version,
        installedAt: new Date().toISOString(),
        path: `${settings.downloadPath}/${app.id}`
    };

    await window.electronAPI.saveInstalledApp(appData);
    await loadInstalledApps();

    // Remove from queue
    downloadQueue = downloadQueue.filter(d => d.id !== app.id);
    isDownloading = false;
    updateBackgroundDownloadWidget();

    // Close modal after short delay
    setTimeout(() => {
        document.getElementById('download-modal').classList.remove('active');
        renderStorePage();
        renderLibraryPage();
    }, 1000);
}

async function launchApp(appId) {
    const app = installedApps.find(a => a.id === appId);
    if (!app || !app.path) {
        await showAlert('ไม่สามารถเปิดโปรแกรมได้', 'ไม่พบไฟล์โปรแกรม กรุณาติดตั้งใหม่', 'warning');
        return;
    }

    await window.electronAPI.launchApp(app.path);

    // Hide launcher to system tray after launching app
    setTimeout(() => {
        window.electronAPI.hideToTray();
    }, 500);
}

// Open app install folder in Explorer
async function openAppFolder(appId) {
    const settings = await window.electronAPI.getSettings();
    const baseDownloadPath = settings.downloadPath || '';
    const folderPath = `${baseDownloadPath}/${appId}`;
    await window.electronAPI.openFolder(folderPath);
}

// Repair app (redownload and reinstall)
async function repairApp(appId) {
    const app = appsData.find(a => a.id === appId);
    if (!app) {
        await showAlert('ไม่พบข้อมูลโปรแกรม', 'ไม่พบโปรแกรมนี้ในรายการ', 'warning');
        return;
    }

    const confirmed = await showConfirm(
        'ซ่อมไฟล์โปรแกรม',
        `ต้องการดาวน์โหลดและติดตั้ง "${app.name}" ใหม่หรือไม่?\n\nไฟล์เดิมจะถูกลบและแทนที่ด้วยไฟล์ใหม่`,
        'info'
    );

    if (!confirmed) return;

    // Redownload the app
    await downloadApp(appId);
}

async function uninstallApp(appId) {
    const app = appsData.find(a => a.id === appId);
    const appName = app ? app.name : 'โปรแกรมนี้';

    const confirmed = await showConfirm(
        'ยืนยันการลบ',
        `คุณต้องการลบ "${appName}" ออกจากเครื่องหรือไม่?`,
        'danger'
    );

    if (!confirmed) return;

    // Show uninstall progress modal
    const modal = document.getElementById('uninstall-modal');
    const nameEl = document.getElementById('uninstall-app-name');
    const statusEl = document.getElementById('uninstall-status');
    const progressEl = document.getElementById('uninstall-progress');
    const percentEl = document.getElementById('uninstall-percent');

    nameEl.textContent = `กำลังลบ ${appName}`;
    statusEl.textContent = 'กำลังหยุดโปรเซส...';
    progressEl.style.width = '0%';
    percentEl.textContent = '0%';

    modal.classList.add('active');

    // Simulate uninstall progress
    const stages = [
        { progress: 20, status: 'กำลังหยุดโปรเซส...' },
        { progress: 50, status: 'กำลังลบไฟล์โปรแกรม...' },
        { progress: 75, status: 'กำลังลบข้อมูลแคช...' },
        { progress: 90, status: 'กำลังล้าง Registry...' },
        { progress: 100, status: 'ลบเสร็จสมบูรณ์!' }
    ];

    for (const stage of stages) {
        await new Promise(resolve => setTimeout(resolve, 400));
        progressEl.style.width = `${stage.progress}%`;
        percentEl.textContent = `${stage.progress}%`;
        statusEl.textContent = stage.status;
    }

    // Actually remove the app
    await window.electronAPI.removeInstalledApp(appId);
    await loadInstalledApps();

    await new Promise(resolve => setTimeout(resolve, 500));
    modal.classList.remove('active');

    renderStorePage();
    renderLibraryPage();
}

// ========================================
// SETTINGS
// ========================================
function updateSettingsDisplay() {
    const pathDisplay = document.getElementById('download-path-display');
    pathDisplay.textContent = settings.downloadPath || 'Default';

    // Load toggle states
    const autoStartToggle = document.getElementById('setting-autostart');
    const trayToggle = document.getElementById('setting-tray');

    autoStartToggle.checked = settings.autoStart || false;
    trayToggle.checked = settings.minimizeToTray !== false; // Default true

    // Auto-start toggle
    autoStartToggle.addEventListener('change', async () => {
        settings.autoStart = autoStartToggle.checked;
        await window.electronAPI.saveSettings(settings);
    });

    // Minimize to tray toggle
    trayToggle.addEventListener('change', async () => {
        settings.minimizeToTray = trayToggle.checked;
        await window.electronAPI.saveSettings(settings);
    });

    // Settings button handlers
    document.getElementById('btn-change-path').addEventListener('click', async () => {
        const newPath = await window.electronAPI.selectDirectory();
        if (newPath) {
            settings.downloadPath = newPath;
            await window.electronAPI.saveSettings(settings);
            pathDisplay.textContent = newPath;
            await showAlert('บันทึกสำเร็จ', `เปลี่ยนที่อยู่การติดตั้งเป็น:\n${newPath}`, 'info');
        }
    });

    document.getElementById('btn-website').addEventListener('click', () => {
        window.electronAPI.openExternal('https://bonchon-studio.com');
    });

    document.getElementById('btn-discord').addEventListener('click', () => {
        window.electronAPI.openExternal('https://discord.gg/bonchon');
    });
}

// Update app (patch)
async function updateApp(appId) {
    const app = appsData.find(a => a.id === appId);
    if (!app) return;

    const confirmed = await showConfirm(
        'อัปเดตโปรแกรม',
        `คุณต้องการอัปเดต "${app.name}" เป็นเวอร์ชัน ${app.version} หรือไม่?`,
        'info'
    );

    if (!confirmed) return;

    // Reuse download flow but it's an update
    await downloadApp(appId);
}

// Make navigateTo global for onclick handlers
window.navigateTo = navigateTo;
window.downloadApp = downloadApp;
window.launchApp = launchApp;
window.uninstallApp = uninstallApp;
window.updateApp = updateApp;
window.openAppFolder = openAppFolder;
window.repairApp = repairApp;

// ========================================
// CUSTOM CONFIRM DIALOG
// ========================================
function showConfirm(title, message, type = 'info') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const iconEl = document.getElementById('confirm-icon');
        const btnOk = document.getElementById('btn-confirm-ok');
        const btnCancel = document.getElementById('btn-confirm-cancel');

        titleEl.textContent = title;
        messageEl.textContent = message;

        // Set icon type
        iconEl.className = 'confirm-icon';
        if (type === 'danger') iconEl.classList.add('danger');
        if (type === 'warning') iconEl.classList.add('warning');

        modal.classList.add('active');

        const cleanup = () => {
            modal.classList.remove('active');
            btnOk.removeEventListener('click', handleOk);
            btnCancel.removeEventListener('click', handleCancel);
        };

        const handleOk = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        btnOk.addEventListener('click', handleOk);
        btnCancel.addEventListener('click', handleCancel);
    });
}

// Check for launcher update
async function checkLauncherUpdate() {
    try {
        const currentVersion = await window.electronAPI.getAppVersion();
        const launcherRepo = 'Smallzoamz/Bonchon-Studio';

        console.log(`Checking launcher update: Current v${currentVersion}`);

        const [owner, repo] = launcherRepo.split('/');
        const release = await window.electronAPI.fetchGitHubRelease({ owner, repo });

        if (release && release.version) {
            const latestVersion = release.version;
            console.log(`Latest launcher version: v${latestVersion}`);

            if (latestVersion !== currentVersion) {
                showAlert(
                    'Launcher อัพเดทใหม่!',
                    `Bonchon Launcher เวอร์ชั่นใหม่ (v${latestVersion}) พร้อมใช้งานแล้ว\nคุณกำลังใช้เวอร์ชั่น v${currentVersion}\n\nกรุณาดาวน์โหลดเวอร์ชั่นใหม่เพื่อฟีเจอร์ที่ครบถ้วน`,
                    'info',
                    () => {
                        window.electronAPI.openExternal('https://github.com/Smallzoamz/Bonchon-Studio/releases/latest');
                    }
                );
            }
        }
    } catch (error) {
        console.warn('Failed to check launcher update:', error);
    }
}

function showAlert(title, message, type = 'info') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const iconEl = document.getElementById('confirm-icon');
        const btnOk = document.getElementById('btn-confirm-ok');
        const btnCancel = document.getElementById('btn-confirm-cancel');

        titleEl.textContent = title;
        messageEl.textContent = message;

        iconEl.className = 'confirm-icon';
        if (type === 'danger') iconEl.classList.add('danger');
        if (type === 'warning') iconEl.classList.add('warning');

        // Hide cancel button for alert
        btnCancel.style.display = 'none';
        btnOk.textContent = 'ตกลง';

        modal.classList.add('active');

        const handleOk = () => {
            modal.classList.remove('active');
            btnCancel.style.display = '';
            btnOk.textContent = 'ยืนยัน';
            btnOk.removeEventListener('click', handleOk);
            resolve();
        };

        btnOk.addEventListener('click', handleOk);
    });
}

window.showConfirm = showConfirm;
window.showAlert = showAlert;
