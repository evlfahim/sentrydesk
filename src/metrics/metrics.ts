import { DockerClient, ContainerInfo, ContainerStats } from '../docker/client'

export interface MetricsEntry {
  containerId: string
  containerName: string
  cpuPercent: number
  memoryUsage: number
  memoryLimit: number
  memoryPercent: number
  timestamp: number
}

export type MetricsCallback = (entries: MetricsEntry[]) => void

export class MetricsStore {
  private static instance: MetricsStore | null = null
  private dockerClient: DockerClient
  private entries: Map<string, MetricsEntry[]>
  private intervalId: ReturnType<typeof setInterval> | null = null
  private updateInterval: number
  private maxEntriesPerContainer: number
  private listeners: Set<MetricsCallback>
  private knownContainerIds: Set<string>

  private constructor(updateInterval = 2000, maxEntries = 60) {
    this.dockerClient = DockerClient.getInstance()
    this.entries = new Map()
    this.updateInterval = updateInterval
    this.maxEntriesPerContainer = maxEntries
    this.listeners = new Set()
    this.knownContainerIds = new Set()
  }

  static getInstance(updateInterval?: number, maxEntries?: number): MetricsStore {
    if (!MetricsStore.instance) {
      MetricsStore.instance = new MetricsStore(updateInterval, maxEntries)
    }
    return MetricsStore.instance
  }

  /**
   * Subscribe to real-time metrics updates.
   * Returns an unsubscribe function.
   */
  subscribe(listener: MetricsCallback): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Start the real-time metrics collection interval.
   */
  start(): void {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.updateMetrics(), this.updateInterval)
  }

  /**
   * Stop the real-time metrics collection interval.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Fetch current metrics from all running containers and notify listeners.
   */
  private async updateMetrics(): Promise<void> {
    if (!this.dockerClient.isConnected()) return

    try {
      const containers = await this.dockerClient.getContainers()
      const currentIds = new Set<string>()

      for (const container of containers) {
        currentIds.add(container.id)
        try {
          const stats = await this.dockerClient.getContainerStats(container.id)
          if (stats) {
            const entry: MetricsEntry = {
              containerId: container.id,
              containerName: container.name,
              cpuPercent: stats.cpuPercent,
              memoryUsage: stats.memoryUsage,
              memoryLimit: stats.memoryLimit,
              memoryPercent: stats.memoryPercent,
              timestamp: Date.now(),
            }

            if (!this.entries.has(container.id)) {
              this.entries.set(container.id, [])
            }
            const history = this.entries.get(container.id)!
            history.push(entry)
            if (history.length > this.maxEntriesPerContainer) {
              history.shift()
            }
          }
        } catch {
          // Container may have been removed between calls
        }
      }

      // Remove entries for containers that no longer exist
      for (const id of this.knownContainerIds) {
        if (!currentIds.has(id)) {
          this.entries.delete(id)
        }
      }
      this.knownContainerIds = currentIds

      // Notify all listeners with latest entries
      const latest = this.getMetrics()
      for (const listener of this.listeners) {
        try {
          listener(latest)
        } catch {
          // Listener errors should not break the metrics stream
        }
      }
    } catch {
      // Docker client may have disconnected
    }
  }

  /**
   * Get the latest metrics entry for each container.
   */
  getMetrics(containerId?: string): MetricsEntry[] {
    if (containerId) {
      return this.entries.get(containerId) || []
    }
    // Return latest entry for each container
    const result: MetricsEntry[] = []
    for (const [, history] of this.entries) {
      if (history.length > 0) {
        result.push(history[history.length - 1])
      }
    }
    return result
  }

  /**
   * Get the full history of metrics for a specific container.
   */
  getHistory(containerId: string): MetricsEntry[] {
    return this.entries.get(containerId) || []
  }

  /**
   * Get all container names that have metrics data.
   */
  getContainerNames(): string[] {
    const names: string[] = []
    for (const [, history] of this.entries) {
      if (history.length > 0) {
        names.push(history[history.length - 1].containerName)
      }
    }
    return names
  }

  /**
   * Get the container IDs that have metrics data.
   */
  getContainerIds(): string[] {
    const ids: string[] = []
    for (const [id] of this.entries) {
      if (this.entries.get(id)!.length > 0) {
        ids.push(id)
      }
    }
    return ids
  }

  /**
   * Get the latest CPU percent for a specific container.
   */
  getCpuPercent(containerId: string): number {
    const history = this.entries.get(containerId)
    if (history && history.length > 0) {
      return history[history.length - 1].cpuPercent
    }
    return 0
  }

  /**
   * Get the latest memory percent for a specific container.
   */
  getMemoryPercent(containerId: string): number {
    const history = this.entries.get(containerId)
    if (history && history.length > 0) {
      return history[history.length - 1].memoryPercent
    }
    return 0
  }

  /**
   * Get the latest memory usage in bytes for a specific container.
   */
  getMemoryUsage(containerId: string): number {
    const history = this.entries.get(containerId)
    if (history && history.length > 0) {
      return history[history.length - 1].memoryUsage
    }
    return 0
  }

  /**
   * Get the latest memory limit in bytes for a specific container.
   */
  getMemoryLimit(containerId: string): number {
    const history = this.entries.get(containerId)
    if (history && history.length > 0) {
      return history[history.length - 1].memoryLimit
    }
    return 0
  }

  /**
   * Clear all stored metrics.
   */
  clear(): void {
    this.entries.clear()
    this.knownContainerIds.clear()
  }

  /**
   * Get the current number of containers being tracked.
   */
  getTrackedCount(): number {
    return this.entries.size
  }

  /**
   * Get the number of history entries for a specific container.
   */
  getHistoryLength(containerId: string): number {
    return (this.entries.get(containerId) || []).length
  }
}
