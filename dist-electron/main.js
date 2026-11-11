"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const core_1 = require("@sentrydesk/core");
const core_2 = require("@sentrydesk/core");
const core_3 = require("@sentrydesk/core");
const core_4 = require("@sentrydesk/core");
const core_5 = require("@sentrydesk/core");
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    // In development, load the Vite dev server; in production, load the built file
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
// ---------------------------------------------------------------------------
// App IPC handlers
// ---------------------------------------------------------------------------
electron_1.ipcMain.handle('app:get-version', () => {
    return electron_1.app.getVersion();
});
electron_1.ipcMain.handle('app:get-platform', () => {
    return process.platform;
});
// ---------------------------------------------------------------------------
// Docker daemon IPC handlers
// ---------------------------------------------------------------------------
electron_1.ipcMain.handle('docker:connect', async () => {
    const client = core_1.DockerClient.getInstance();
    try {
        await client.connect();
    }
    catch {
        // Silently fail — the renderer will check isConnected()
    }
});
electron_1.ipcMain.handle('docker:is-connected', () => {
    return core_1.DockerClient.getInstance().isConnected();
});
electron_1.ipcMain.handle('docker:get-containers', async () => {
    return await core_1.DockerClient.getInstance().getContainers();
});
electron_1.ipcMain.handle('docker:get-container-stats', async (_event, containerId) => {
    return await core_1.DockerClient.getInstance().getContainerStats(containerId);
});
electron_1.ipcMain.handle('docker:restart-container', async (_event, containerId) => {
    return await core_1.DockerClient.getInstance().restartContainer(containerId);
});
electron_1.ipcMain.handle('docker:stop-container', async (_event, containerId) => {
    return await core_1.DockerClient.getInstance().stopContainer(containerId);
});
electron_1.ipcMain.handle('docker:start-container', async (_event, containerId) => {
    return await core_1.DockerClient.getInstance().startContainer(containerId);
});
electron_1.ipcMain.handle('docker:remove-container', async (_event, containerId, force) => {
    return await core_1.DockerClient.getInstance().removeContainer(containerId, force);
});
electron_1.ipcMain.handle('docker:get-container-logs', async (_event, containerId, options = {}) => {
    return await core_1.DockerClient.getInstance().getContainerLogs(containerId, options);
});
electron_1.ipcMain.handle('docker:get-compose-files', async (_event, projectName) => {
    return await core_1.DockerClient.getInstance().getComposeFiles(projectName);
});
electron_1.ipcMain.handle('docker:get-compose-file-content', async (_event, projectName) => {
    return await core_1.DockerClient.getInstance().getComposeFileContent(projectName);
});
electron_1.ipcMain.handle('docker:get-compose-project-info', async (_event, projectName) => {
    return await core_1.DockerClient.getInstance().getComposeProjectInfo(projectName);
});
electron_1.ipcMain.handle('docker:get-disk-usage', async () => {
    return await core_1.DockerClient.getInstance().getDiskUsage();
});
// ---------------------------------------------------------------------------
// Metrics IPC handlers
// ---------------------------------------------------------------------------
electron_1.ipcMain.handle('metrics:start', () => {
    core_2.MetricsStore.getInstance().start();
});
electron_1.ipcMain.handle('metrics:stop', () => {
    core_2.MetricsStore.getInstance().stop();
});
electron_1.ipcMain.handle('metrics:get', () => {
    return core_2.MetricsStore.getInstance().getMetrics();
});
electron_1.ipcMain.handle('metrics:get-history', (_event, containerId) => {
    return core_2.MetricsStore.getInstance().getHistory(containerId);
});
electron_1.ipcMain.handle('metrics:get-container-names', () => {
    return core_2.MetricsStore.getInstance().getContainerNames();
});
electron_1.ipcMain.handle('metrics:get-container-ids', () => {
    return core_2.MetricsStore.getInstance().getContainerIds();
});
electron_1.ipcMain.handle('metrics:get-cpu-percent', (_event, containerId) => {
    return core_2.MetricsStore.getInstance().getCpuPercent(containerId);
});
electron_1.ipcMain.handle('metrics:get-memory-percent', (_event, containerId) => {
    return core_2.MetricsStore.getInstance().getMemoryPercent(containerId);
});
electron_1.ipcMain.handle('metrics:get-memory-usage', (_event, containerId) => {
    return core_2.MetricsStore.getInstance().getMemoryUsage(containerId);
});
electron_1.ipcMain.handle('metrics:get-memory-limit', (_event, containerId) => {
    return core_2.MetricsStore.getInstance().getMemoryLimit(containerId);
});
electron_1.ipcMain.handle('metrics:clear', () => {
    core_2.MetricsStore.getInstance().clear();
});
electron_1.ipcMain.handle('metrics:get-tracked-count', () => {
    return core_2.MetricsStore.getInstance().getTrackedCount();
});
electron_1.ipcMain.handle('metrics:get-history-length', (_event, containerId) => {
    return core_2.MetricsStore.getInstance().getHistoryLength(containerId);
});
// ---------------------------------------------------------------------------
// Logs IPC handlers
// ---------------------------------------------------------------------------
electron_1.ipcMain.handle('logs:fetch', async (_event, containerId, options = {}) => {
    return await core_3.LogStore.getInstance().fetchLogs(containerId, options);
});
electron_1.ipcMain.handle('logs:get', (_event, containerId) => {
    return core_3.LogStore.getInstance().getLogs(containerId);
});
electron_1.ipcMain.handle('logs:filter', (_event, containerId, filter) => {
    return core_3.LogStore.getInstance().filterLogs(containerId, filter);
});
electron_1.ipcMain.handle('logs:set-follow', (_event, containerId, follow) => {
    core_3.LogStore.getInstance().setFollowMode(containerId, follow);
});
electron_1.ipcMain.handle('logs:is-follow', (_event, containerId) => {
    return core_3.LogStore.getInstance().isFollowMode(containerId);
});
electron_1.ipcMain.handle('logs:clear', (_event, containerId) => {
    core_3.LogStore.getInstance().clearLogs(containerId);
});
electron_1.ipcMain.handle('logs:get-container-names', () => {
    return core_3.LogStore.getInstance().getContainerNames();
});
electron_1.ipcMain.handle('logs:get-log-count', (_event, containerId) => {
    return core_3.LogStore.getInstance().getLogCount(containerId);
});
// ---------------------------------------------------------------------------
// Cleanup IPC handlers
// ---------------------------------------------------------------------------
electron_1.ipcMain.handle('cleanup:analyze', async () => {
    return await core_4.CleanupEngine.getInstance().analyze();
});
electron_1.ipcMain.handle('cleanup:get-suggestions', () => {
    return core_4.CleanupEngine.getInstance().getSuggestions();
});
electron_1.ipcMain.handle('cleanup:get-total-savings', () => {
    return core_4.CleanupEngine.getInstance().getTotalSavings();
});
electron_1.ipcMain.handle('cleanup:clear', () => {
    core_4.CleanupEngine.getInstance().clear();
});
// ---------------------------------------------------------------------------
// Compose IPC handlers
// ---------------------------------------------------------------------------
electron_1.ipcMain.handle('compose:parse', (_event, content, projectName) => {
    return (0, core_5.parseComposeFile)(content, projectName);
});
electron_1.ipcMain.handle('compose:validate', (_event, config) => {
    return (0, core_5.validateCompose)(config);
});
electron_1.ipcMain.handle('compose:get-service-summary', (_event, config) => {
    return (0, core_5.getServiceSummary)(config);
});
//# sourceMappingURL=main.js.map