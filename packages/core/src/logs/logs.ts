import { DockerClient } from '../docker/client'

export interface LogEntry {
  timestamp: string | null
  stream: 'stdout' | 'stderr'
  message: string
}

export interface LogFilter {
  search?: string
  stream?: 'stdout' | 'stderr' | 'all'
  tail?: number
}

export interface LogStoreListener {
  (containerId: string, entries: LogEntry[]): void
}

export class LogStore {
  private static instance: LogStore | null = null
  private dockerClient: DockerClient
  private logs: Map<string, LogEntry[]>
  private followMode: Map<string, boolean>
  private followIntervals: Map<string, ReturnType<typeof setInterval>>
  private listeners: Set<LogStoreListener>
  private maxEntriesPerContainer: number

  private constructor(maxEntriesPerContainer = 5000) {
    this.dockerClient = DockerClient.getInstance()
    this.logs = new Map()
    this.followMode = new Map()
    this.followIntervals = new Map()
    this.listeners = new Set()
    this.maxEntriesPerContainer = maxEntriesPerContainer
  }

  static getInstance(maxEntriesPerContainer?: number): LogStore {
    if (!LogStore.instance) {
      LogStore.instance = new LogStore(maxEntriesPerContainer)
    }
    return LogStore.instance
  }

  subscribe(listener: LogStoreListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(containerId: string, entries: LogEntry[]): void {
    for (const listener of this.listeners) {
      try {
        listener(containerId, entries)
      } catch {
        // Listener errors should not break the store
      }
    }
  }

  async fetchLogs(
    containerId: string,
    options: { tail?: number; since?: number } = {},
  ): Promise<LogEntry[]> {
    if (!this.dockerClient.isConnected()) {
      throw new Error('Docker client not connected')
    }

    const rawLines = await this.dockerClient.getContainerLogs(containerId, {
      tail: options.tail ?? 200,
      since: options.since,
      timestamps: true,
    })

    const entries: LogEntry[] = []
    for (const line of rawLines) {
      let timestamp: string | null = null
      let stream: 'stdout' | 'stderr' = 'stdout'
      let message = line

      // Try to parse timestamp-prefixed lines
      const tsMatch = line.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?)\s+(stdout|stderr)\s+[F]\s+(.*)$/,
      )
      if (tsMatch) {
        timestamp = tsMatch[1]
        stream = tsMatch[2] as 'stdout' | 'stderr'
        message = tsMatch[3]
      } else {
        // Try simpler format: timestamp stream message
        const simpleMatch = line.match(
          /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?)\s+(stdout|stderr)\s+(.*)$/,
        )
        if (simpleMatch) {
          timestamp = simpleMatch[1]
          stream = simpleMatch[2] as 'stdout' | 'stderr'
          message = simpleMatch[3]
        } else {
          // No timestamp, check stream prefix
          const streamMatch = line.match(/^(stdout|stderr):\s+(.*)$/)
          if (streamMatch) {
            stream = streamMatch[1] as 'stdout' | 'stderr'
            message = streamMatch[2]
          }
        }
      }

      entries.push({ timestamp, stream, message })
    }

    // Append to existing logs if in follow mode, otherwise replace
    const existing = this.logs.get(containerId)
    if (existing && this.isFollowMode(containerId)) {
      // Append new entries, keeping only the last maxEntriesPerContainer
      const combined = [...existing, ...entries]
      if (combined.length > this.maxEntriesPerContainer) {
        this.logs.set(containerId, combined.slice(-this.maxEntriesPerContainer))
      } else {
        this.logs.set(containerId, combined)
      }
    } else {
      // Trim to maxEntriesPerContainer
      if (entries.length > this.maxEntriesPerContainer) {
        this.logs.set(containerId, entries.slice(-this.maxEntriesPerContainer))
      } else {
        this.logs.set(containerId, entries)
      }
    }

    this.notify(containerId, this.logs.get(containerId) || [])
    return this.logs.get(containerId) || []
  }

  getLogs(containerId: string): LogEntry[] {
    return this.logs.get(containerId) || []
  }

  filterLogs(containerId: string, filter: LogFilter): LogEntry[] {
    let entries = this.logs.get(containerId) || []

    if (filter.search) {
      const searchLower = filter.search.toLowerCase()
      entries = entries.filter((entry) => entry.message.toLowerCase().includes(searchLower))
    }

    if (filter.stream && filter.stream !== 'all') {
      entries = entries.filter((entry) => entry.stream === filter.stream)
    }

    if (filter.tail && filter.tail > 0) {
      entries = entries.slice(-filter.tail)
    }

    return entries
  }

  setFollowMode(containerId: string, follow: boolean): void {
    this.followMode.set(containerId, follow)

    if (follow) {
      this.startFollow(containerId)
    } else {
      this.stopFollow(containerId)
    }
  }

  isFollowMode(containerId: string): boolean {
    return this.followMode.get(containerId) || false
  }

  private startFollow(containerId: string): void {
    // Stop any existing interval first
    this.stopFollow(containerId)

    const interval = setInterval(async () => {
      try {
        await this.fetchLogs(containerId)
      } catch {
        // Ignore errors during follow polling
      }
    }, 2000)

    this.followIntervals.set(containerId, interval)
  }

  private stopFollow(containerId: string): void {
    const interval = this.followIntervals.get(containerId)
    if (interval) {
      clearInterval(interval)
      this.followIntervals.delete(containerId)
    }
  }

  clearLogs(containerId?: string): void {
    if (containerId) {
      this.stopFollow(containerId)
      this.logs.delete(containerId)
    } else {
      for (const id of this.followIntervals.keys()) {
        this.stopFollow(id)
      }
      this.logs.clear()
      this.followMode.clear()
    }
  }

  getContainerNames(): string[] {
    return Array.from(this.logs.keys())
  }

  getLogCount(containerId: string): number {
    return this.logs.get(containerId)?.length || 0
  }
}
