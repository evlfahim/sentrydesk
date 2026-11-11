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

export class MetricsStore {
  private static instance: MetricsStore | null = null
  private dockerClient: DockerClient
  private entries: Map<string, MetricsEntry[]>
  private intervalId: ReturnType<typeof setInterval> | null = null
  private updateInterval: number
  private maxEntriesPerContainer: number

  private constructor(updateInterval = 2000, maxEntries = 60) {
    this.dockerClient = DockerClient.getInstance()
    this.entries = new Map()
    this.updateInterval = updateInterval
    this.maxEntriesPerContainer = maxEntries
  }

  static getInstance(updateInterval?: number, maxEntries?: number): MetricsStore {
    if (!MetricsStore.instance) {
      MetricsStore.instance = new MetricsStore(updateInterval, maxEntries)
    }
    return MetricsStore.instance
  }

  start(): void {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.updateMetrics(), this.updateInterval)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async updateMetrics(): Promise<void> {
    if (!this.dockerClient.isConnected()) return

    try {
      const containers = await this.dockerClient.getContainers()
      for (const container of containers) {
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
    } catch {
      // Docker client may have disconnected
    }
  }

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

  getHistory(containerId: string): MetricsEntry[] {
    return this.entries.get(containerId) || []
  }

  getContainerNames(): string[] {
    const names: string[] = []
    for (const [, history] of this.entries) {
      if (history.length > 0) {
        names.push(history[history.length - 1].containerName)
      }
    }
    return names
  }

  clear(): void {
    this.entries.clear()
  }
}
