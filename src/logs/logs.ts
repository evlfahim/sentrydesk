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

export class LogStore {
  private static instance: LogStore | null = null
  private dockerClient: DockerClient
  private logs: Map<string, LogEntry[]>
  private followMode: Map<string, boolean>

  private constructor() {
    this.dockerClient = DockerClient.getInstance()
    this.logs = new Map()
    this.followMode = new Map()
  }

  static getInstance(): LogStore {
    if (!LogStore.instance) {
      LogStore.instance = new LogStore()
    }
    return LogStore.instance
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
      // Docker logs are prefixed with 8-byte header + timestamp
      // Format: [timestamp] stream: message
      // Dockerode with timestamps=true returns lines like:
      // "2024-01-01T00:00:00.000000000Z stdout F message\n"
      // or "2024-01-01T00:00:00.000000000Z stderr F message\n"
      // or without stream prefix for non-timestamped: "message\n"

      let timestamp: string | null = null
      let stream: 'stdout' | 'stderr' = 'stdout'
      let message = line

      // Try to parse timestamp-prefixed lines
      const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?)\s+(stdout|stderr)\s+[F]\s+(.*)$/)
      if (tsMatch) {
        timestamp = tsMatch[1]
        stream = tsMatch[2] as 'stdout' | 'stderr'
        message = tsMatch[3]
      } else {
        // Try simpler format: timestamp stream message
        const simpleMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?)\s+(stdout|stderr)\s+(.*)$/)
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

    this.logs.set(containerId, entries)
    return entries
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
  }

  isFollowMode(containerId: string): boolean {
    return this.followMode.get(containerId) || false
  }

  clearLogs(containerId?: string): void {
    if (containerId) {
      this.logs.delete(containerId)
    } else {
      this.logs.clear()
    }
  }
}
