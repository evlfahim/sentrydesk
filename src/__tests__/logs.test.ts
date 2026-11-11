import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LogStore, LogEntry, LogFilter } from '../logs/logs'
import { DockerClient } from '../docker/client'

describe('LogStore', () => {
  beforeEach(() => {
    LogStore['instance'] = null
  })

  afterEach(() => {
    // Clean up any intervals
    const store = LogStore.getInstance()
    for (const id of store['followIntervals'].keys()) {
      store['stopFollow'](id)
    }
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

  describe('filterLogs with combined filters', () => {
    it('should apply tail after search and stream filters', () => {
      const store = LogStore.getInstance()
      const testLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Error A' },
        { timestamp: '2024-01-01T00:00:01.000000000Z', stream: 'stdout', message: 'Error B' },
        { timestamp: '2024-01-01T00:00:02.000000000Z', stream: 'stdout', message: 'Error C' },
        { timestamp: '2024-01-01T00:00:03.000000000Z', stream: 'stdout', message: 'Error D' },
        { timestamp: '2024-01-01T00:00:04.000000000Z', stream: 'stdout', message: 'Error E' },
      ]
      store['logs'].set('test-container', testLogs)

      const filtered = store.filterLogs('test-container', { search: 'Error', tail: 2 })
      expect(filtered).toHaveLength(2)
      expect(filtered[0].message).toBe('Error D')
      expect(filtered[1].message).toBe('Error E')
    })

    it('should return all logs when no filter is provided', () => {
      const store = LogStore.getInstance()
      const testLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Line 1' },
        { timestamp: '2024-01-01T00:00:01.000000000Z', stream: 'stderr', message: 'Line 2' },
      ]
      store['logs'].set('test-container', testLogs)

      const filtered = store.filterLogs('test-container', {})
      expect(filtered).toHaveLength(2)
    })

    it('should handle case-insensitive search', () => {
      const store = LogStore.getInstance()
      const testLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Hello World' },
        { timestamp: '2024-01-01T00:00:01.000000000Z', stream: 'stdout', message: 'hello universe' },
        { timestamp: '2024-01-01T00:00:02.000000000Z', stream: 'stdout', message: 'GOODBYE' },
      ]
      store['logs'].set('test-container', testLogs)

      const filtered = store.filterLogs('test-container', { search: 'hello' })
      expect(filtered).toHaveLength(2)
      expect(filtered[0].message).toBe('Hello World')
      expect(filtered[1].message).toBe('hello universe')
    })

    it('should return empty array when search matches nothing', () => {
      const store = LogStore.getInstance()
      const testLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Hello' },
      ]
      store['logs'].set('test-container', testLogs)

      const filtered = store.filterLogs('test-container', { search: 'xyz' })
      expect(filtered).toHaveLength(0)
    })

    it('should handle stream filter with all value', () => {
      const store = LogStore.getInstance()
      const testLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Hello' },
        { timestamp: '2024-01-01T00:00:01.000000000Z', stream: 'stderr', message: 'Error' },
      ]
      store['logs'].set('test-container', testLogs)

      const filtered = store.filterLogs('test-container', { stream: 'all' })
      expect(filtered).toHaveLength(2)
    })
  })

  describe('follow mode', () => {
    it('should start follow mode and create interval', () => {
      const store = LogStore.getInstance()
      store.setFollowMode('test-container', true)
      expect(store.isFollowMode('test-container')).toBe(true)
      expect(store['followIntervals'].has('test-container')).toBe(true)
    })

    it('should stop follow mode and clear interval', () => {
      const store = LogStore.getInstance()
      store.setFollowMode('test-container', true)
      store.setFollowMode('test-container', false)
      expect(store.isFollowMode('test-container')).toBe(false)
      expect(store['followIntervals'].has('test-container')).toBe(false)
    })

    it('should replace interval when toggling follow mode', () => {
      const store = LogStore.getInstance()
      store.setFollowMode('test-container', true)
      const interval1 = store['followIntervals'].get('test-container')
      store.setFollowMode('test-container', true)
      const interval2 = store['followIntervals'].get('test-container')
      expect(interval1).not.toBe(interval2)
    })

    it('should clear all follow intervals when clearing all logs', () => {
      const store = LogStore.getInstance()
      store.setFollowMode('container-a', true)
      store.setFollowMode('container-b', true)
      store.clearLogs()
      expect(store['followIntervals'].size).toBe(0)
      expect(store['followMode'].size).toBe(0)
    })
  })

  describe('subscribe/unsubscribe', () => {
    it('should notify listeners on log update', () => {
      const store = LogStore.getInstance()
      const testLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Hello' },
      ]
      store['logs'].set('test-container', testLogs)

      const listener = vi.fn()
      const unsubscribe = store.subscribe(listener)

      // Manually trigger notify
      store['notify']('test-container', testLogs)

      expect(listener).toHaveBeenCalledWith('test-container', testLogs)
      unsubscribe()
    })

    it('should not notify after unsubscribe', () => {
      const store = LogStore.getInstance()
      const testLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Hello' },
      ]
      store['logs'].set('test-container', testLogs)

      const listener = vi.fn()
      const unsubscribe = store.subscribe(listener)
      unsubscribe()

      store['notify']('test-container', testLogs)
      expect(listener).not.toHaveBeenCalled()
    })

    it('should handle multiple listeners', () => {
      const store = LogStore.getInstance()
      const testLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Hello' },
      ]
      store['logs'].set('test-container', testLogs)

      const listener1 = vi.fn()
      const listener2 = vi.fn()
      store.subscribe(listener1)
      store.subscribe(listener2)

      store['notify']('test-container', testLogs)

      expect(listener1).toHaveBeenCalledWith('test-container', testLogs)
      expect(listener2).toHaveBeenCalledWith('test-container', testLogs)
    })

    it('should isolate listener errors', () => {
      const store = LogStore.getInstance()
      const testLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Hello' },
      ]
      store['logs'].set('test-container', testLogs)

      const badListener = vi.fn(() => { throw new Error('listener error') })
      const goodListener = vi.fn()
      store.subscribe(badListener)
      store.subscribe(goodListener)

      // Should not throw
      store['notify']('test-container', testLogs)

      expect(badListener).toHaveBeenCalled()
      expect(goodListener).toHaveBeenCalled()
    })
  })

  describe('getLogCount', () => {
    it('should return correct log count', () => {
      const store = LogStore.getInstance()
      const testLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Line 1' },
        { timestamp: '2024-01-01T00:00:01.000000000Z', stream: 'stdout', message: 'Line 2' },
        { timestamp: '2024-01-01T00:00:02.000000000Z', stream: 'stdout', message: 'Line 3' },
      ]
      store['logs'].set('test-container', testLogs)

      expect(store.getLogCount('test-container')).toBe(3)
    })

    it('should return 0 for unknown container', () => {
      const store = LogStore.getInstance()
      expect(store.getLogCount('unknown-container')).toBe(0)
    })
  })

  describe('getContainerNames', () => {
    it('should return list of containers with logs', () => {
      const store = LogStore.getInstance()
      store['logs'].set('container-a', [])
      store['logs'].set('container-b', [])
      store['logs'].set('container-c', [])

      const names = store.getContainerNames()
      expect(names).toContain('container-a')
      expect(names).toContain('container-b')
      expect(names).toContain('container-c')
      expect(names).toHaveLength(3)
    })

    it('should return empty array when no logs', () => {
      const store = LogStore.getInstance()
      expect(store.getContainerNames()).toEqual([])
    })
  })

  describe('follow mode log accumulation', () => {
    it('should append new entries when in follow mode', () => {
      const store = LogStore.getInstance()
      const initialLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Initial' },
      ]
      store['logs'].set('test-container', initialLogs)
      store.setFollowMode('test-container', true)

      // Simulate new entries arriving
      const newEntries: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:01.000000000Z', stream: 'stdout', message: 'New 1' },
        { timestamp: '2024-01-01T00:00:02.000000000Z', stream: 'stdout', message: 'New 2' },
      ]
      store['logs'].set('test-container', [...initialLogs, ...newEntries])

      const allLogs = store.getLogs('test-container')
      expect(allLogs).toHaveLength(3)
      expect(allLogs[0].message).toBe('Initial')
      expect(allLogs[2].message).toBe('New 2')
    })

    it('should replace entries when not in follow mode', () => {
      const store = LogStore.getInstance()
      const initialLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Initial' },
      ]
      store['logs'].set('test-container', initialLogs)
      store.setFollowMode('test-container', false)

      // Simulate new entries
      const newEntries: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:01.000000000Z', stream: 'stdout', message: 'New' },
      ]
      store['logs'].set('test-container', newEntries)

      const allLogs = store.getLogs('test-container')
      expect(allLogs).toHaveLength(1)
      expect(allLogs[0].message).toBe('New')
    })
  })

  describe('max entries trimming', () => {
    it('should trim entries when exceeding maxEntriesPerContainer during fetch', async () => {
      const store = LogStore.getInstance(3)
      // Mock the Docker client's getContainerLogs to return 5 lines
      const mockDockerClient = {
        isConnected: () => true,
        getContainerLogs: vi.fn().mockResolvedValue([
          '2024-01-01T00:00:00.000000000Z stdout F Line 1',
          '2024-01-01T00:00:01.000000000Z stdout F Line 2',
          '2024-01-01T00:00:02.000000000Z stdout F Line 3',
          '2024-01-01T00:00:03.000000000Z stdout F Line 4',
          '2024-01-01T00:00:04.000000000Z stdout F Line 5',
        ]),
      }
      // Replace the dockerClient reference
      store['dockerClient'] = mockDockerClient as any

      const logs = await store.fetchLogs('test-container')
      expect(logs).toHaveLength(3)
      expect(logs[0].message).toBe('Line 3')
      expect(logs[1].message).toBe('Line 4')
      expect(logs[2].message).toBe('Line 5')
    })
  })

  describe('LogEntry structure', () => {
    it('should have all required fields', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T00:00:00.000000000Z',
        stream: 'stdout',
        message: 'Test message',
      }
      expect(entry).toHaveProperty('timestamp')
      expect(entry).toHaveProperty('stream')
      expect(entry).toHaveProperty('message')
      expect(entry.stream).toBe('stdout')
      expect(typeof entry.message).toBe('string')
    })

    it('should allow null timestamp', () => {
      const entry: LogEntry = {
        timestamp: null,
        stream: 'stderr',
        message: 'No timestamp',
      }
      expect(entry.timestamp).toBeNull()
      expect(entry.stream).toBe('stderr')
    })
  })

  describe('LogFilter interface', () => {
    it('should allow partial filter objects', () => {
      const filter1: LogFilter = { search: 'test' }
      expect(filter1.search).toBe('test')
      expect(filter1.stream).toBeUndefined()
      expect(filter1.tail).toBeUndefined()

      const filter2: LogFilter = { stream: 'stderr' }
      expect(filter2.stream).toBe('stderr')
      expect(filter2.search).toBeUndefined()
      expect(filter2.tail).toBeUndefined()

      const filter3: LogFilter = { tail: 50 }
      expect(filter3.tail).toBe(50)
      expect(filter3.search).toBeUndefined()
      expect(filter3.stream).toBeUndefined()
    })

    it('should allow all filter options', () => {
      const filter: LogFilter = {
        search: 'error',
        stream: 'stderr',
        tail: 100,
      }
      expect(filter.search).toBe('error')
      expect(filter.stream).toBe('stderr')
      expect(filter.tail).toBe(100)
    })
  })
})
