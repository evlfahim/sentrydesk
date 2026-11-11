/**
 * IPC channel handlers for the VS Code extension.
 *
 * Mirrors the channel names used by the Electron main process
 * (electron/main.ts) so desktop and IDE expose the same @sentrydesk/core
 * surface.  Handlers are plain functions; they are served over a local
 * socket by IpcServer and can also be invoked in-process via CoreBridge.
 */

import {
  DockerClient,
  MetricsStore,
  LogStore,
  CleanupEngine,
  ComposeConfig,
  LogFilter,
  parseComposeFile,
  validateCompose,
  getServiceSummary,
} from '@sentrydesk/core'

export type IpcHandler = (...args: any[]) => unknown

export interface CoreServices {
  dockerClient: DockerClient
  metricsStore: MetricsStore
  logStore: LogStore
  cleanupEngine: CleanupEngine
}

export function createCoreHandlers(services: CoreServices): Record<string, IpcHandler> {
  const { dockerClient, metricsStore, logStore, cleanupEngine } = services

  return {
    // Docker daemon
    'docker:connect': () => dockerClient.connect(),
    'docker:is-connected': () => dockerClient.isConnected(),
    'docker:get-containers': () => dockerClient.getContainers(),
    'docker:get-container-stats': (containerId: string) => dockerClient.getContainerStats(containerId),
    'docker:restart-container': (containerId: string) => dockerClient.restartContainer(containerId),
    'docker:stop-container': (containerId: string) => dockerClient.stopContainer(containerId),
    'docker:start-container': (containerId: string) => dockerClient.startContainer(containerId),
    'docker:remove-container': (containerId: string, force?: boolean) =>
      dockerClient.removeContainer(containerId, force ?? false),
    'docker:get-container-logs': (
      containerId: string,
      options: { tail?: number; since?: number; timestamps?: boolean; follow?: boolean } = {},
    ) => dockerClient.getContainerLogs(containerId, options),
    'docker:get-disk-usage': () => dockerClient.getDiskUsage(),

    // Metrics
    'metrics:start': () => metricsStore.start(),
    'metrics:stop': () => metricsStore.stop(),
    'metrics:get': (containerId?: string) => metricsStore.getMetrics(containerId),
    'metrics:get-history': (containerId: string) => metricsStore.getHistory(containerId),
    'metrics:get-container-names': () => metricsStore.getContainerNames(),
    'metrics:get-container-ids': () => metricsStore.getContainerIds(),
    'metrics:clear': () => metricsStore.clear(),
    'metrics:get-tracked-count': () => metricsStore.getTrackedCount(),

    // Logs
    'logs:fetch': (containerId: string, options: { tail?: number; since?: number } = {}) =>
      logStore.fetchLogs(containerId, options),
    'logs:get': (containerId: string) => logStore.getLogs(containerId),
    'logs:filter': (containerId: string, filter: LogFilter) => logStore.filterLogs(containerId, filter),
    'logs:set-follow': (containerId: string, follow: boolean) => logStore.setFollowMode(containerId, follow),
    'logs:is-follow': (containerId: string) => logStore.isFollowMode(containerId),
    'logs:clear': (containerId?: string) => logStore.clearLogs(containerId),
    'logs:get-container-names': () => logStore.getContainerNames(),
    'logs:get-log-count': (containerId: string) => logStore.getLogCount(containerId),

    // Cleanup
    'cleanup:analyze': () => cleanupEngine.analyze(),
    'cleanup:get-suggestions': () => cleanupEngine.getSuggestions(),
    'cleanup:get-total-savings': () => cleanupEngine.getTotalSavings(),
    'cleanup:clear': () => cleanupEngine.clear(),

    // Compose
    'compose:parse': (content: string, projectName?: string) => parseComposeFile(content, projectName),
    'compose:validate': (config: ComposeConfig) => validateCompose(config),
    'compose:get-service-summary': (config: ComposeConfig) => getServiceSummary(config),
  }
}

/**
 * In-process dispatcher over the handler table.
 */
export class CoreBridge {
  private handlers: Record<string, IpcHandler>

  constructor(handlers: Record<string, IpcHandler>) {
    this.handlers = handlers
  }

  get channels(): string[] {
    return Object.keys(this.handlers)
  }

  has(channel: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.handlers, channel)
  }

  async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    if (!this.has(channel)) {
      throw new Error(`Unknown IPC channel: ${channel}`)
    }
    return (await this.handlers[channel](...args)) as T
  }
}
