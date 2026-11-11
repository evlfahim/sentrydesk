import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),

  // Docker daemon
  dockerConnect: () => ipcRenderer.invoke('docker:connect'),
  dockerIsConnected: () => ipcRenderer.invoke('docker:is-connected'),
  dockerGetContainers: () => ipcRenderer.invoke('docker:get-containers'),
  dockerGetContainerStats: (containerId: string) =>
    ipcRenderer.invoke('docker:get-container-stats', containerId),
  dockerRestartContainer: (containerId: string) =>
    ipcRenderer.invoke('docker:restart-container', containerId),
  dockerStopContainer: (containerId: string) =>
    ipcRenderer.invoke('docker:stop-container', containerId),
  dockerStartContainer: (containerId: string) =>
    ipcRenderer.invoke('docker:start-container', containerId),
  dockerRemoveContainer: (containerId: string, force: boolean) =>
    ipcRenderer.invoke('docker:remove-container', containerId, force),
  dockerGetContainerLogs: (
    containerId: string,
    options?: { tail?: number; since?: number; timestamps?: boolean; follow?: boolean },
  ) => ipcRenderer.invoke('docker:get-container-logs', containerId, options),
  dockerGetComposeFiles: (projectName?: string) =>
    ipcRenderer.invoke('docker:get-compose-files', projectName),
  dockerGetComposeFileContent: (projectName: string) =>
    ipcRenderer.invoke('docker:get-compose-file-content', projectName),
  dockerGetComposeProjectInfo: (projectName: string) =>
    ipcRenderer.invoke('docker:get-compose-project-info', projectName),
  dockerGetDiskUsage: () => ipcRenderer.invoke('docker:get-disk-usage'),

  // Metrics
  metricsStart: () => ipcRenderer.invoke('metrics:start'),
  metricsStop: () => ipcRenderer.invoke('metrics:stop'),
  metricsGet: () => ipcRenderer.invoke('metrics:get'),
  metricsGetHistory: (containerId: string) =>
    ipcRenderer.invoke('metrics:get-history', containerId),
  metricsGetContainerNames: () => ipcRenderer.invoke('metrics:get-container-names'),
  metricsGetContainerIds: () => ipcRenderer.invoke('metrics:get-container-ids'),
  metricsGetCpuPercent: (containerId: string) =>
    ipcRenderer.invoke('metrics:get-cpu-percent', containerId),
  metricsGetMemoryPercent: (containerId: string) =>
    ipcRenderer.invoke('metrics:get-memory-percent', containerId),
  metricsGetMemoryUsage: (containerId: string) =>
    ipcRenderer.invoke('metrics:get-memory-usage', containerId),
  metricsGetMemoryLimit: (containerId: string) =>
    ipcRenderer.invoke('metrics:get-memory-limit', containerId),
  metricsClear: () => ipcRenderer.invoke('metrics:clear'),
  metricsGetTrackedCount: () => ipcRenderer.invoke('metrics:get-tracked-count'),
  metricsGetHistoryLength: (containerId: string) =>
    ipcRenderer.invoke('metrics:get-history-length', containerId),

  // Logs
  logsFetch: (
    containerId: string,
    options?: { tail?: number; since?: number },
  ) => ipcRenderer.invoke('logs:fetch', containerId, options),
  logsGet: (containerId: string) => ipcRenderer.invoke('logs:get', containerId),
  logsFilter: (containerId: string, filter: { search?: string; stream?: string; tail?: number }) =>
    ipcRenderer.invoke('logs:filter', containerId, filter),
  logsSetFollow: (containerId: string, follow: boolean) =>
    ipcRenderer.invoke('logs:set-follow', containerId, follow),
  logsIsFollow: (containerId: string) =>
    ipcRenderer.invoke('logs:is-follow', containerId),
  logsClear: (containerId?: string) =>
    ipcRenderer.invoke('logs:clear', containerId),
  logsGetContainerNames: () => ipcRenderer.invoke('logs:get-container-names'),
  logsGetLogCount: (containerId: string) =>
    ipcRenderer.invoke('logs:get-log-count', containerId),

  // Cleanup
  cleanupAnalyze: () => ipcRenderer.invoke('cleanup:analyze'),
  cleanupGetSuggestions: () => ipcRenderer.invoke('cleanup:get-suggestions'),
  cleanupGetTotalSavings: () => ipcRenderer.invoke('cleanup:get-total-savings'),
  cleanupClear: () => ipcRenderer.invoke('cleanup:clear'),

  // Compose
  composeParse: (content: string, projectName?: string) =>
    ipcRenderer.invoke('compose:parse', content, projectName),
  composeValidate: (config: {
    version?: string
    name: string
    services: Array<{ name: string; image?: string; build?: string | { context: string; dockerfile?: string }; ports?: Array<{ host: number; container: number; protocol?: string }>; environment?: Record<string, string>; volumes?: string[]; dependsOn?: string[]; restart?: string; networks?: string[]; command?: string; entrypoint?: string; healthcheck?: { test: string; interval?: string; timeout?: string; retries?: number }; [key: string]: unknown }>
    networks: Array<{ name: string; driver?: string; external?: boolean; [key: string]: unknown }>
    volumes: Array<{ name: string; driver?: string; external?: boolean; [key: string]: unknown }>
    raw: string
  }) => ipcRenderer.invoke('compose:validate', config),
  composeGetServiceSummary: (config: {
    version?: string
    name: string
    services: Array<{ name: string; image?: string; build?: string | { context: string; dockerfile?: string }; ports?: Array<{ host: number; container: number; protocol?: string }>; environment?: Record<string, string>; volumes?: string[]; dependsOn?: string[]; restart?: string; networks?: string[]; command?: string; entrypoint?: string; healthcheck?: { test: string; interval?: string; timeout?: string; retries?: number }; [key: string]: unknown }>
    networks: Array<{ name: string; driver?: string; external?: boolean; [key: string]: unknown }>
    volumes: Array<{ name: string; driver?: string; external?: boolean; [key: string]: unknown }>
    raw: string
  }) => ipcRenderer.invoke('compose:get-service-summary', config),

  // Events (bidirectional)
  sendDockerEvent: (event: string, data: unknown) =>
    ipcRenderer.send('docker:event', event, data),
  onDockerEvent: (callback: (event: string, data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, e: string, d: unknown) =>
      callback(e, d)
    ipcRenderer.on('docker:event', handler)
    return () => ipcRenderer.removeListener('docker:event', handler)
  },
})
