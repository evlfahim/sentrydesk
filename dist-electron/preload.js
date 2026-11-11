"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // App
    getVersion: () => electron_1.ipcRenderer.invoke('app:get-version'),
    getPlatform: () => electron_1.ipcRenderer.invoke('app:get-platform'),
    // Docker daemon
    dockerConnect: () => electron_1.ipcRenderer.invoke('docker:connect'),
    dockerIsConnected: () => electron_1.ipcRenderer.invoke('docker:is-connected'),
    dockerGetContainers: () => electron_1.ipcRenderer.invoke('docker:get-containers'),
    dockerGetContainerStats: (containerId) => electron_1.ipcRenderer.invoke('docker:get-container-stats', containerId),
    dockerRestartContainer: (containerId) => electron_1.ipcRenderer.invoke('docker:restart-container', containerId),
    dockerStopContainer: (containerId) => electron_1.ipcRenderer.invoke('docker:stop-container', containerId),
    dockerStartContainer: (containerId) => electron_1.ipcRenderer.invoke('docker:start-container', containerId),
    dockerRemoveContainer: (containerId, force) => electron_1.ipcRenderer.invoke('docker:remove-container', containerId, force),
    dockerGetContainerLogs: (containerId, options) => electron_1.ipcRenderer.invoke('docker:get-container-logs', containerId, options),
    dockerGetComposeFiles: (projectName) => electron_1.ipcRenderer.invoke('docker:get-compose-files', projectName),
    dockerGetComposeFileContent: (projectName) => electron_1.ipcRenderer.invoke('docker:get-compose-file-content', projectName),
    dockerGetComposeProjectInfo: (projectName) => electron_1.ipcRenderer.invoke('docker:get-compose-project-info', projectName),
    dockerGetDiskUsage: () => electron_1.ipcRenderer.invoke('docker:get-disk-usage'),
    // Metrics
    metricsStart: () => electron_1.ipcRenderer.invoke('metrics:start'),
    metricsStop: () => electron_1.ipcRenderer.invoke('metrics:stop'),
    metricsGet: () => electron_1.ipcRenderer.invoke('metrics:get'),
    metricsGetHistory: (containerId) => electron_1.ipcRenderer.invoke('metrics:get-history', containerId),
    metricsGetContainerNames: () => electron_1.ipcRenderer.invoke('metrics:get-container-names'),
    metricsGetContainerIds: () => electron_1.ipcRenderer.invoke('metrics:get-container-ids'),
    metricsGetCpuPercent: (containerId) => electron_1.ipcRenderer.invoke('metrics:get-cpu-percent', containerId),
    metricsGetMemoryPercent: (containerId) => electron_1.ipcRenderer.invoke('metrics:get-memory-percent', containerId),
    metricsGetMemoryUsage: (containerId) => electron_1.ipcRenderer.invoke('metrics:get-memory-usage', containerId),
    metricsGetMemoryLimit: (containerId) => electron_1.ipcRenderer.invoke('metrics:get-memory-limit', containerId),
    metricsClear: () => electron_1.ipcRenderer.invoke('metrics:clear'),
    metricsGetTrackedCount: () => electron_1.ipcRenderer.invoke('metrics:get-tracked-count'),
    metricsGetHistoryLength: (containerId) => electron_1.ipcRenderer.invoke('metrics:get-history-length', containerId),
    // Logs
    logsFetch: (containerId, options) => electron_1.ipcRenderer.invoke('logs:fetch', containerId, options),
    logsGet: (containerId) => electron_1.ipcRenderer.invoke('logs:get', containerId),
    logsFilter: (containerId, filter) => electron_1.ipcRenderer.invoke('logs:filter', containerId, filter),
    logsSetFollow: (containerId, follow) => electron_1.ipcRenderer.invoke('logs:set-follow', containerId, follow),
    logsIsFollow: (containerId) => electron_1.ipcRenderer.invoke('logs:is-follow', containerId),
    logsClear: (containerId) => electron_1.ipcRenderer.invoke('logs:clear', containerId),
    logsGetContainerNames: () => electron_1.ipcRenderer.invoke('logs:get-container-names'),
    logsGetLogCount: (containerId) => electron_1.ipcRenderer.invoke('logs:get-log-count', containerId),
    // Cleanup
    cleanupAnalyze: () => electron_1.ipcRenderer.invoke('cleanup:analyze'),
    cleanupGetSuggestions: () => electron_1.ipcRenderer.invoke('cleanup:get-suggestions'),
    cleanupGetTotalSavings: () => electron_1.ipcRenderer.invoke('cleanup:get-total-savings'),
    cleanupClear: () => electron_1.ipcRenderer.invoke('cleanup:clear'),
    // Compose
    composeParse: (content, projectName) => electron_1.ipcRenderer.invoke('compose:parse', content, projectName),
    composeValidate: (config) => electron_1.ipcRenderer.invoke('compose:validate', config),
    composeGetServiceSummary: (config) => electron_1.ipcRenderer.invoke('compose:get-service-summary', config),
    // Events (bidirectional)
    sendDockerEvent: (event, data) => electron_1.ipcRenderer.send('docker:event', event, data),
    onDockerEvent: (callback) => {
        const handler = (_event, e, d) => callback(e, d);
        electron_1.ipcRenderer.on('docker:event', handler);
        return () => electron_1.ipcRenderer.removeListener('docker:event', handler);
    },
});
//# sourceMappingURL=preload.js.map