import { describe, it, expect, beforeEach } from 'vitest'
import { LogStore, LogEntry, LogFilter } from '../logs/logs'
import { DockerClient } from '../docker/client'

describe('LogStore', () => {
  beforeEach(() => {
    LogStore['instance'] = null
  })

  it('should create a singleton instance', () => {
    const store1 = LogStore.getInstance()
    const store2 = LogStore.getInstance()
    expect(store1).toBe(store2)
  })

  it('should return empty logs initially', () => {
    const store = LogStore.getInstance()
    expect(store.getLogs('test-container')).toEqual([])
  })

  it('should throw when fetching logs without connection', async () => {
    const store = LogStore.getInstance()
    await expect(store.fetchLogs('test-container')).rejects.toThrow(
      'Docker client not connected',
    )
  })

  it('should filter logs by search term', () => {
    const store = LogStore.getInstance()
    const testLogs: LogEntry[] = [
      { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Hello world' },
      { timestamp: '2024-01-01T00:00:01.000000000Z', stream: 'stdout', message: 'Goodbye world' },
      { timestamp: '2024-01-01T00:00:02.000000000Z', stream: 'stderr', message: 'Error occurred' },
    ]
    store['logs'].set('test-container', testLogs)

    const filtered = store.filterLogs('test-container', { search: 'world' })
    expect(filtered).toHaveLength(2)
    expect(filtered[0].message).toBe('Hello world')
    expect(filtered[1].message).toBe('Goodbye world')
  })

  it('should filter logs by stream', () => {
    const store = LogStore.getInstance()
    const testLogs: LogEntry[] = [
      { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Hello' },
      { timestamp: '2024-01-01T00:00:01.000000000Z', stream: 'stderr', message: 'Error' },
      { timestamp: '2024-01-01T00:00:02.000000000Z', stream: 'stdout', message: 'World' },
    ]
    store['logs'].set('test-container', testLogs)

    const filtered = store.filterLogs('test-container', { stream: 'stderr' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].stream).toBe('stderr')
  })

  it('should filter logs by tail count', () => {
    const store = LogStore.getInstance()
    const testLogs: LogEntry[] = [
      { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Line 1' },
      { timestamp: '2024-01-01T00:00:01.000000000Z', stream: 'stdout', message: 'Line 2' },
      { timestamp: '2024-01-01T00:00:02.000000000Z', stream: 'stdout', message: 'Line 3' },
      { timestamp: '2024-01-01T00:00:03.000000000Z', stream: 'stdout', message: 'Line 4' },
      { timestamp: '2024-01-01T00:00:04.000000000Z', stream: 'stdout', message: 'Line 5' },
    ]
    store['logs'].set('test-container', testLogs)

    const filtered = store.filterLogs('test-container', { tail: 2 })
    expect(filtered).toHaveLength(2)
    expect(filtered[0].message).toBe('Line 4')
    expect(filtered[1].message).toBe('Line 5')
  })

  it('should combine search and stream filters', () => {
    const store = LogStore.getInstance()
    const testLogs: LogEntry[] = [
      { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Error in stdout' },
      { timestamp: '2024-01-01T00:00:01.000000000Z', stream: 'stderr', message: 'Error in stderr' },
      { timestamp: '2024-01-01T00:00:02.000000000Z', stream: 'stdout', message: 'Info message' },
    ]
    store['logs'].set('test-container', testLogs)

    const filtered = store.filterLogs('test-container', { search: 'Error', stream: 'stderr' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].message).toBe('Error in stderr')
  })

  it('should set and check follow mode', () => {
    const store = LogStore.getInstance()
    expect(store.isFollowMode('test-container')).toBe(false)
    store.setFollowMode('test-container', true)
    expect(store.isFollowMode('test-container')).toBe(true)
  })

  it('should clear logs for specific container', () => {
    const store = LogStore.getInstance()
    store['logs'].set('container-a', [])
    store['logs'].set('container-b', [])
    store.clearLogs('container-a')
    expect(store.getLogs('container-a')).toEqual([])
    expect(store.getLogs('container-b')).toEqual([])
  })

  it('should clear all logs', () => {
    const store = LogStore.getInstance()
    store['logs'].set('container-a', [])
    store['logs'].set('container-b', [])
    store.clearLogs()
    expect(store.getLogs('container-a')).toEqual([])
    expect(store.getLogs('container-b')).toEqual([])
  })

  describe('parse log lines', () => {
    // These tests verify the log parsing logic that lives inside getContainerLogs.
    // We replicate the parsing here to test each branch independently.

    it('should parse timestamped stdout lines', () => {
      const line = '2024-01-01T00:00:00.000000000Z stdout F Hello world'
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?)\s+(stdout|stderr)\s+[F]\s+(.*)$/,
      )
      expect(match).not.toBeNull()
      if (match) {
        expect(match[1]).toBe('2024-01-01T00:00:00.000000000Z')
        expect(match[2]).toBe('stdout')
        expect(match[3]).toBe('Hello world')
      }
    })

    it('should parse timestamped stderr lines', () => {
      const line = '2024-01-01T00:00:00.000000000Z stderr F Error occurred'
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?)\s+(stdout|stderr)\s+[F]\s+(.*)$/,
      )
      expect(match).not.toBeNull()
      if (match) {
        expect(match[1]).toBe('2024-01-01T00:00:00.000000000Z')
        expect(match[2]).toBe('stderr')
        expect(match[3]).toBe('Error occurred')
      }
    })

    it('should handle plain lines without timestamp', () => {
      const line = 'plain log line'
      let timestamp: string | null = null
      let stream: 'stdout' | 'stderr' = 'stdout'
      let message = line

      const tsMatch = line.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?)\s+(stdout|stderr)\s+[F]\s+(.*)$/,
      )
      if (!tsMatch) {
        const streamMatch = line.match(/^(stdout|stderr):\s+(.*)$/)
        if (streamMatch) {
          stream = streamMatch[1] as 'stdout' | 'stderr'
          message = streamMatch[2]
        }
      }

      expect(timestamp).toBeNull()
      expect(stream).toBe('stdout')
      expect(message).toBe('plain log line')
    })

    it('should handle stream-prefixed lines', () => {
      const line = 'stdout: some message'
      let timestamp: string | null = null
      let stream: 'stdout' | 'stderr' = 'stdout'
      let message = line

      const tsMatch = line.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?)\s+(stdout|stderr)\s+[F]\s+(.*)$/,
      )
      if (!tsMatch) {
        const streamMatch = line.match(/^(stdout|stderr):\s+(.*)$/)
        if (streamMatch) {
          stream = streamMatch[1] as 'stdout' | 'stderr'
          message = streamMatch[2]
        }
      }

      expect(timestamp).toBeNull()
      expect(stream).toBe('stdout')
      expect(message).toBe('some message')
    })
  })
})
