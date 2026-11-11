import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { DockerClient, ContainerInfo, ContainerStats } from '@sentrydesk/core'
import { MetricsStore, MetricsEntry } from '@sentrydesk/core'
import { LogStore, LogEntry, LogFilter } from '@sentrydesk/core'
import { CleanupEngine, CleanupSuggestion } from '@sentrydesk/core'
import {
  ComposeFile,
  ComposeConfig,
  ComposeValidationError,
  parseComposeFile,
  validateCompose,
  getServiceSummary,
} from '@sentrydesk/core'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // In development, load the Vite dev server; in production, load the built file
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// ---------------------------------------------------------------------------
// App IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('app:get-version', () => {
  return app.getVersion()
})

ipcMain.handle('app:get-platform', () => {
  return process.platform
})

// ---------------------------------------------------------------------------
// Docker daemon IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('docker:connect', async () => {
  const client = DockerClient.getInstance()
  try {
    await client.connect()
  } catch {
    // Silently fail — the renderer will check isConnected()
  }
})

ipcMain.handle('docker:is-connected', () => {
  return DockerClient.getInstance().isConnected()
})

ipcMain.handle('docker:get-containers', async () => {
  return await DockerClient.getInstance().getContainers()
})

ipcMain.handle('docker:get-container-stats', async (_event, containerId: string) => {
  return await DockerClient.getInstance().getContainerStats(containerId)
})

ipcMain.handle('docker:restart-container', async (_event, containerId: string) => {
  return await DockerClient.getInstance().restartContainer(containerId)
})

ipcMain.handle('docker:stop-container', async (_event, containerId: string) => {
  return await DockerClient.getInstance().stopContainer(containerId)
})

ipcMain.handle('docker:start-container', async (_event, containerId: string) => {
  return await DockerClient.getInstance().startContainer(containerId)
})

ipcMain.handle('docker:remove-container', async (_event, containerId: string, force: boolean) => {
  return await DockerClient.getInstance().removeContainer(containerId, force)
})

ipcMain.handle(
  'docker:get-container-logs',
  async (_event, containerId: string, options: { tail?: number; since?: number; timestamps?: boolean; follow?: boolean } = {}) => {
    return await DockerClient.getInstance().getContainerLogs(containerId, options)
  },
)

ipcMain.handle('docker:get-compose-files', async (_event, projectName?: string) => {
  return await DockerClient.getInstance().getComposeFiles(projectName)
})

ipcMain.handle('docker:get-compose-file-content', async (_event, projectName: string) => {
  return await DockerClient.getInstance().getComposeFileContent(projectName)
})

ipcMain.handle(
  'docker:get-compose-project-info',
  async (_event, projectName: string) => {
    return await DockerClient.getInstance().getComposeProjectInfo(projectName)
  },
)

ipcMain.handle('docker:get-disk-usage', async () => {
  return await DockerClient.getInstance().getDiskUsage()
})

// ---------------------------------------------------------------------------
// Metrics IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('metrics:start', () => {
  MetricsStore.getInstance().start()
})

ipcMain.handle('metrics:stop', () => {
  MetricsStore.getInstance().stop()
})

ipcMain.handle('metrics:get', () => {
  return MetricsStore.getInstance().getMetrics()
})

ipcMain.handle('metrics:get-history', (_event, containerId: string) => {
  return MetricsStore.getInstance().getHistory(containerId)
})

ipcMain.handle('metrics:get-container-names', () => {
  return MetricsStore.getInstance().getContainerNames()
})

ipcMain.handle('metrics:get-container-ids', () => {
  return MetricsStore.getInstance().getContainerIds()
})

ipcMain.handle('metrics:get-cpu-percent', (_event, containerId: string) => {
  return MetricsStore.getInstance().getCpuPercent(containerId)
})

ipcMain.handle('metrics:get-memory-percent', (_event, containerId: string) => {
  return MetricsStore.getInstance().getMemoryPercent(containerId)
})

ipcMain.handle('metrics:get-memory-usage', (_event, containerId: string) => {
  return MetricsStore.getInstance().getMemoryUsage(containerId)
})

ipcMain.handle('metrics:get-memory-limit', (_event, containerId: string) => {
  return MetricsStore.getInstance().getMemoryLimit(containerId)
})

ipcMain.handle('metrics:clear', () => {
  MetricsStore.getInstance().clear()
})

ipcMain.handle('metrics:get-tracked-count', () => {
  return MetricsStore.getInstance().getTrackedCount()
})

ipcMain.handle('metrics:get-history-length', (_event, containerId: string) => {
  return MetricsStore.getInstance().getHistoryLength(containerId)
})

// ---------------------------------------------------------------------------
// Logs IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle(
  'logs:fetch',
  async (_event, containerId: string, options: { tail?: number; since?: number } = {}) => {
    return await LogStore.getInstance().fetchLogs(containerId, options)
  },
)

ipcMain.handle('logs:get', (_event, containerId: string) => {
  return LogStore.getInstance().getLogs(containerId)
})

ipcMain.handle('logs:filter', (_event, containerId: string, filter: LogFilter) => {
  return LogStore.getInstance().filterLogs(containerId, filter)
})

ipcMain.handle('logs:set-follow', (_event, containerId: string, follow: boolean) => {
  LogStore.getInstance().setFollowMode(containerId, follow)
})

ipcMain.handle('logs:is-follow', (_event, containerId: string) => {
  return LogStore.getInstance().isFollowMode(containerId)
})

ipcMain.handle('logs:clear', (_event, containerId?: string) => {
  LogStore.getInstance().clearLogs(containerId)
})

ipcMain.handle('logs:get-container-names', () => {
  return LogStore.getInstance().getContainerNames()
})

ipcMain.handle('logs:get-log-count', (_event, containerId: string) => {
  return LogStore.getInstance().getLogCount(containerId)
})

// ---------------------------------------------------------------------------
// Cleanup IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('cleanup:analyze', async () => {
  return await CleanupEngine.getInstance().analyze()
})

ipcMain.handle('cleanup:get-suggestions', () => {
  return CleanupEngine.getInstance().getSuggestions()
})

ipcMain.handle('cleanup:get-total-savings', () => {
  return CleanupEngine.getInstance().getTotalSavings()
})

ipcMain.handle('cleanup:clear', () => {
  CleanupEngine.getInstance().clear()
})

// ---------------------------------------------------------------------------
// Compose IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle(
  'compose:parse',
  (_event, content: string, projectName?: string) => {
    return parseComposeFile(content, projectName)
  },
)

ipcMain.handle('compose:validate', (_event, config: ComposeConfig) => {
  return validateCompose(config)
})

ipcMain.handle('compose:get-service-summary', (_event, config: ComposeConfig) => {
  return getServiceSummary(config)
})
