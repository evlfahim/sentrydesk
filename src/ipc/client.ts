/**
 * IPC client for the renderer process.
 *
 * Provides a typed, promise-based API that communicates with the Electron
 * main process over IPC channels.  Each method maps to a single
 * `ipcRenderer.invoke` call so that the main process can own the Docker
 * daemon connection while the renderer stays sandboxed.
 *
 * This module is designed to work both inside Electron (where
 * `window.electronAPI` is exposed by the preload script) and in a plain
 * browser / test environment (where it falls back to no-op stubs so that
 * unit tests can run without an Electron runtime).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type {
  ContainerInfo,
  ContainerStats,
  MetricsEntry,
  LogEntry,
  LogFilter,
  CleanupSuggestion,
  ComposeFile,
  ComposeConfig,
  ComposeValidationError,
} from '@sentrydesk/core'

// ---------------------------------------------------------------------------
// Helper: read the electron API from globalThis (works in both Node and
// browser environments).  In Electron the preload script exposes it on
// window.electronAPI which is the same as globalThis.electronAPI.
// ---------------------------------------------------------------------------

function getApi(): ElectronAPI | null {
  return (globalThis as any).electronAPI ?? null
}

// ---------------------------------------------------------------------------
// IPC client class
// ---------------------------------------------------------------------------

export class IpcClient {
  // -----------------------------------------------------------------------
  // App
  // -----------------------------------------------------------------------

  async getVersion(): Promise<string> {
    const api = getApi()
    if (!api || typeof api.getVersion !== 'function') return '0.0.0'
    try {
      return await api.getVersion()
    } catch {
      return '0.0.0'
    }
  }

  async getPlatform(): Promise<string> {
    const api = getApi()
    if (!api || typeof api.getPlatform !== 'function') return 'unknown'
    try {
      return await api.getPlatform()
    } catch {
      return 'unknown'
    }
  }

  // -----------------------------------------------------------------------
  // Docker daemon
  // -----------------------------------------------------------------------

  async dockerConnect(): Promise<boolean> {
    const api = getApi()
    if (!api || typeof api.dockerConnect !== 'function') return false
    try {
      await api.dockerConnect()
      return true
    } catch {
      return false
    }
  }

  async dockerIsConnected(): Promise<boolean> {
    const api = getApi()
    if (!api || typeof api.dockerIsConnected !== 'function') return false
    try {
      return await api.dockerIsConnected()
    } catch {
      return false
    }
  }

  async dockerGetContainers(): Promise<ContainerInfo[]> {
    const api = getApi()
    if (!api || typeof api.dockerGetContainers !== 'function') return []
    try {
      return await api.dockerGetContainers()
    } catch {
      return []
    }
  }

  async dockerGetContainerStats(containerId: string): Promise<ContainerStats | null> {
    const api = getApi()
    if (!api || typeof api.dockerGetContainerStats !== 'function') return null
    try {
      return await api.dockerGetContainerStats(containerId)
    } catch {
      return null
    }
  }

  async dockerRestartContainer(containerId: string): Promise<boolean> {
    const api = getApi()
    if (!api || typeof api.dockerRestartContainer !== 'function') return false
    try {
      await api.dockerRestartContainer(containerId)
      return true
    } catch {
      return false
    }
  }

  async dockerStopContainer(containerId: string): Promise<boolean> {
    const api = getApi()
    if (!api || typeof api.dockerStopContainer !== 'function') return false
    try {
      await api.dockerStopContainer(containerId)
      return true
    } catch {
      return false
    }
  }

  async dockerStartContainer(containerId: string): Promise<boolean> {
    const api = getApi()
    if (!api || typeof api.dockerStartContainer !== 'function') return false
    try {
      await api.dockerStartContainer(containerId)
      return true
    } catch {
      return false
    }
  }

  async dockerRemoveContainer(containerId: string, force = false): Promise<boolean> {
    const api = getApi()
    if (!api || typeof api.dockerRemoveContainer !== 'function') return false
    try {
      await api.dockerRemoveContainer(containerId, force)
      return true
    } catch {
      return false
    }
  }

  async dockerGetContainerLogs(
    containerId: string,
    options: { tail?: number; since?: number; timestamps?: boolean; follow?: boolean } = {},
  ): Promise<string[]> {
    const api = getApi()
    if (!api || typeof api.dockerGetContainerLogs !== 'function') return []
    try {
      return await api.dockerGetContainerLogs(containerId, options)
    } catch {
      return []
    }
  }

  async dockerGetComposeFiles(projectName?: string): Promise<string[]> {
    const api = getApi()
    if (!api || typeof api.dockerGetComposeFiles !== 'function') return []
    try {
      return await api.dockerGetComposeFiles(projectName)
    } catch {
      return []
    }
  }

  async dockerGetComposeFileContent(projectName: string): Promise<string> {
    const api = getApi()
    if (!api || typeof api.dockerGetComposeFileContent !== 'function') return ''
    try {
      return await api.dockerGetComposeFileContent(projectName)
    } catch {
      return ''
    }
  }

  async dockerGetComposeProjectInfo(projectName: string): Promise<{
    name: string
    status: string
    services: number
    configFile: string
  } | null> {
    const api = getApi()
    if (!api || typeof api.dockerGetComposeProjectInfo !== 'function') return null
    try {
      return await api.dockerGetComposeProjectInfo(projectName)
    } catch {
      return null
    }
  }

  async dockerGetDiskUsage(): Promise<{
    images: { totalSize: number; count: number }
    volumes: { totalSize: number; count: number }
    buildCache: { totalSize: number }
    containers: { totalSize: number; count: number }
  }> {
    const api = getApi()
    if (!api || typeof api.dockerGetDiskUsage !== 'function') {
      return {
        images: { totalSize: 0, count: 0 },
        volumes: { totalSize: 0, count: 0 },
        buildCache: { totalSize: 0 },
        containers: { totalSize: 0, count: 0 },
      }
    }
    try {
      return await api.dockerGetDiskUsage()
    } catch {
      return {
        images: { totalSize: 0, count: 0 },
        volumes: { totalSize: 0, count: 0 },
        buildCache: { totalSize: 0 },
        containers: { totalSize: 0, count: 0 },
      }
    }
  }

  // -----------------------------------------------------------------------
  // Metrics
  // -----------------------------------------------------------------------

  metricsStart(): boolean {
    const api = getApi()
    if (!api || typeof api.metricsStart !== 'function') return false
    try {
      api.metricsStart()
      return true
    } catch {
      return false
    }
  }

  metricsStop(): boolean {
    const api = getApi()
    if (!api || typeof api.metricsStop !== 'function') return false
    try {
      api.metricsStop()
      return true
    } catch {
      return false
    }
  }

  async metricsGet(): Promise<MetricsEntry[]> {
    const api = getApi()
    if (!api || typeof api.metricsGet !== 'function') return []
    try {
      return await api.metricsGet()
    } catch {
      return []
    }
  }

  async metricsGetHistory(containerId: string): Promise<MetricsEntry[]> {
    const api = getApi()
    if (!api || typeof api.metricsGetHistory !== 'function') return []
    try {
      return await api.metricsGetHistory(containerId)
    } catch {
      return []
    }
  }

  async metricsGetContainerNames(): Promise<string[]> {
    const api = getApi()
    if (!api || typeof api.metricsGetContainerNames !== 'function') return []
    try {
      return await api.metricsGetContainerNames()
    } catch {
      return []
    }
  }

  async metricsGetContainerIds(): Promise<string[]> {
    const api = getApi()
    if (!api || typeof api.metricsGetContainerIds !== 'function') return []
    try {
      return await api.metricsGetContainerIds()
    } catch {
      return []
    }
  }

  async metricsGetCpuPercent(containerId: string): Promise<number> {
    const api = getApi()
    if (!api || typeof api.metricsGetCpuPercent !== 'function') return 0
    try {
      return await api.metricsGetCpuPercent(containerId)
    } catch {
      return 0
    }
  }

  async metricsGetMemoryPercent(containerId: string): Promise<number> {
    const api = getApi()
    if (!api || typeof api.metricsGetMemoryPercent !== 'function') return 0
    try {
      return await api.metricsGetMemoryPercent(containerId)
    } catch {
      return 0
    }
  }

  async metricsGetMemoryUsage(containerId: string): Promise<number> {
    const api = getApi()
    if (!api || typeof api.metricsGetMemoryUsage !== 'function') return 0
    try {
      return await api.metricsGetMemoryUsage(containerId)
    } catch {
      return 0
    }
  }

  async metricsGetMemoryLimit(containerId: string): Promise<number> {
    const api = getApi()
    if (!api || typeof api.metricsGetMemoryLimit !== 'function') return 0
    try {
      return await api.metricsGetMemoryLimit(containerId)
    } catch {
      return 0
    }
  }

  metricsClear(): boolean {
    const api = getApi()
    if (!api || typeof api.metricsClear !== 'function') return false
    try {
      api.metricsClear()
      return true
    } catch {
      return false
    }
  }

  async metricsGetTrackedCount(): Promise<number> {
    const api = getApi()
    if (!api || typeof api.metricsGetTrackedCount !== 'function') return 0
    try {
      return await api.metricsGetTrackedCount()
    } catch {
      return 0
    }
  }

  async metricsGetHistoryLength(containerId: string): Promise<number> {
    const api = getApi()
    if (!api || typeof api.metricsGetHistoryLength !== 'function') return 0
    try {
      return await api.metricsGetHistoryLength(containerId)
    } catch {
      return 0
    }
  }

  // -----------------------------------------------------------------------
  // Logs
  // -----------------------------------------------------------------------

  async logsFetch(
    containerId: string,
    options: { tail?: number; since?: number } = {},
  ): Promise<LogEntry[]> {
    const api = getApi()
    if (!api || typeof api.logsFetch !== 'function') return []
    try {
      return await api.logsFetch(containerId, options)
    } catch {
      return []
    }
  }

  async logsGet(containerId: string): Promise<LogEntry[]> {
    const api = getApi()
    if (!api || typeof api.logsGet !== 'function') return []
    try {
      return await api.logsGet(containerId)
    } catch {
      return []
    }
  }

  async logsFilter(
    containerId: string,
    filter: LogFilter,
  ): Promise<LogEntry[]> {
    const api = getApi()
    if (!api || typeof api.logsFilter !== 'function') return []
    try {
      return await api.logsFilter(containerId, filter)
    } catch {
      return []
    }
  }

  logsSetFollow(containerId: string, follow: boolean): boolean {
    const api = getApi()
    if (!api || typeof api.logsSetFollow !== 'function') return false
    try {
      api.logsSetFollow(containerId, follow)
      return true
    } catch {
      return false
    }
  }

  async logsIsFollow(containerId: string): Promise<boolean> {
    const api = getApi()
    if (!api || typeof api.logsIsFollow !== 'function') return false
    try {
      return await api.logsIsFollow(containerId)
    } catch {
      return false
    }
  }

  logsClear(containerId?: string): boolean {
    const api = getApi()
    if (!api || typeof api.logsClear !== 'function') return false
    try {
      api.logsClear(containerId)
      return true
    } catch {
      return false
    }
  }

  async logsGetContainerNames(): Promise<string[]> {
    const api = getApi()
    if (!api || typeof api.logsGetContainerNames !== 'function') return []
    try {
      return await api.logsGetContainerNames()
    } catch {
      return []
    }
  }

  async logsGetLogCount(containerId: string): Promise<number> {
    const api = getApi()
    if (!api || typeof api.logsGetLogCount !== 'function') return 0
    try {
      return await api.logsGetLogCount(containerId)
    } catch {
      return 0
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  async cleanupAnalyze(): Promise<CleanupSuggestion[]> {
    const api = getApi()
    if (!api || typeof api.cleanupAnalyze !== 'function') return []
    try {
      return await api.cleanupAnalyze()
    } catch {
      return []
    }
  }

  async cleanupGetSuggestions(): Promise<CleanupSuggestion[]> {
    const api = getApi()
    if (!api || typeof api.cleanupGetSuggestions !== 'function') return []
    try {
      return await api.cleanupGetSuggestions()
    } catch {
      return []
    }
  }

  async cleanupGetTotalSavings(): Promise<number> {
    const api = getApi()
    if (!api || typeof api.cleanupGetTotalSavings !== 'function') return 0
    try {
      return await api.cleanupGetTotalSavings()
    } catch {
      return 0
    }
  }

  cleanupClear(): boolean {
    const api = getApi()
    if (!api || typeof api.cleanupClear !== 'function') return false
    try {
      api.cleanupClear()
      return true
    } catch {
      return false
    }
  }

  // -----------------------------------------------------------------------
  // Compose
  // -----------------------------------------------------------------------

  async composeParse(
    content: string,
    projectName?: string,
  ): Promise<ComposeFile> {
    const api = getApi()
    if (!api || typeof api.composeParse !== 'function') {
      return { path: '', content, config: null, errors: [] }
    }
    try {
      return await api.composeParse(content, projectName)
    } catch {
      return { path: '', content, config: null, errors: [] }
    }
  }

  async composeValidate(
    config: ComposeConfig,
  ): Promise<ComposeValidationError[]> {
    const api = getApi()
    if (!api || typeof api.composeValidate !== 'function') return []
    try {
      return await api.composeValidate(config)
    } catch {
      return []
    }
  }

  async composeGetServiceSummary(
    config: ComposeConfig,
  ): Promise<Array<{
    name: string
    image?: string
    build?: string
    ports: string[]
    status: string
  }>> {
    const api = getApi()
    if (!api || typeof api.composeGetServiceSummary !== 'function') return []
    try {
      return await api.composeGetServiceSummary(config)
    } catch {
      return []
    }
  }

  // -----------------------------------------------------------------------
  // Events (bidirectional)
  // -----------------------------------------------------------------------

  onDockerEvent(callback: (event: string, data: unknown) => void): () => void {
    const api = getApi()
    if (!api || typeof api.onDockerEvent !== 'function') {
      return () => {}
    }
    return api.onDockerEvent(callback)
  }

  sendDockerEvent(event: string, data: unknown): void {
    const api = getApi()
    if (!api || typeof api.sendDockerEvent !== 'function') return
    api.sendDockerEvent(event, data)
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const ipcClient = new IpcClient()
