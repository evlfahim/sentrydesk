import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MetricsStore, MetricsEntry } from '../metrics/metrics'
import { DockerClient } from '../docker/client'

describe('MetricsStore', () => {
  let mockDockerClient: {
    isConnected: ReturnType<typeof vi.fn>
    getContainers: ReturnType<typeof vi.fn>
    getContainerStats: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    MetricsStore['instance'] = null

    // Create a mock DockerClient
    mockDockerClient = {
      isConnected: vi.fn().mockReturnValue(true),
      getContainers: vi.fn().mockResolvedValue([]),
      getContainerStats: vi.fn().mockResolvedValue(null),
    }

    // Replace the DockerClient singleton with our mock
    ;(DockerClient as any).instance = mockDockerClient
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('singleton', () => {
    it('should create a singleton instance', () => {
      const store1 = MetricsStore.getInstance()
      const store2 = MetricsStore.getInstance()
      expect(store1).toBe(store2)
    })

    it('should use default interval and max entries', () => {
      const store = MetricsStore.getInstance()
      expect(store['updateInterval']).toBe(2000)
      expect(store['maxEntriesPerContainer']).toBe(60)
    })

    it('should accept custom interval and max entries', () => {
      const store = MetricsStore.getInstance(1000, 30)
      expect(store['updateInterval']).toBe(1000)
      expect(store['maxEntriesPerContainer']).toBe(30)
    })
  })

  describe('initial state', () => {
    it('should return empty metrics initially', () => {
      const store = MetricsStore.getInstance()
      expect(store.getMetrics()).toEqual([])
    })

    it('should return empty history for unknown container', () => {
      const store = MetricsStore.getInstance()
      expect(store.getHistory('unknown-container')).toEqual([])
    })

    it('should return empty container names initially', () => {
      const store = MetricsStore.getInstance()
      expect(store.getContainerNames()).toEqual([])
    })

    it('should return empty container ids initially', () => {
      const store = MetricsStore.getInstance()
      expect(store.getContainerIds()).toEqual([])
    })

    it('should return 0 for cpu percent of unknown container', () => {
      const store = MetricsStore.getInstance()
      expect(store.getCpuPercent('unknown')).toBe(0)
    })

    it('should return 0 for memory percent of unknown container', () => {
      const store = MetricsStore.getInstance()
      expect(store.getMemoryPercent('unknown')).toBe(0)
    })

    it('should return 0 for memory usage of unknown container', () => {
      const store = MetricsStore.getInstance()
      expect(store.getMemoryUsage('unknown')).toBe(0)
    })

    it('should return 0 for memory limit of unknown container', () => {
      const store = MetricsStore.getInstance()
      expect(store.getMemoryLimit('unknown')).toBe(0)
    })

    it('should return 0 tracked count initially', () => {
      const store = MetricsStore.getInstance()
      expect(store.getTrackedCount()).toBe(0)
    })

    it('should return 0 history length for unknown container', () => {
      const store = MetricsStore.getInstance()
      expect(store.getHistoryLength('unknown')).toBe(0)
    })
  })

  describe('subscribe / unsubscribe', () => {
    it('should call listener with latest metrics on update', async () => {
      const store = MetricsStore.getInstance()
      const listener = vi.fn()
      const unsubscribe = store.subscribe(listener)

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'test-container',
          image: 'node:20',
          state: 'running',
          status: 'Up 5 minutes',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 25.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      await store['updateMetrics']()

      expect(listener).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            containerId: 'abc123',
            containerName: 'test-container',
            cpuPercent: 25.5,
            memoryUsage: 52428800,
            memoryLimit: 2147483648,
            memoryPercent: 2.44,
          }),
        ]),
      )

      unsubscribe()
    })

    it('should not call listener after unsubscribe', async () => {
      const store = MetricsStore.getInstance()
      const listener = vi.fn()
      const unsubscribe = store.subscribe(listener)

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'test-container',
          image: 'node:20',
          state: 'running',
          status: 'Up 5 minutes',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 25.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      await store['updateMetrics']()
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()

      // Reset mock to return different data
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 50.0,
        memoryUsage: 104857600,
        memoryLimit: 2147483648,
        memoryPercent: 4.88,
      })

      await store['updateMetrics']()
      // Listener should still have the old call count
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('should support multiple listeners', async () => {
      const store = MetricsStore.getInstance()
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      store.subscribe(listener1)
      store.subscribe(listener2)

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'test-container',
          image: 'node:20',
          state: 'running',
          status: 'Up 5 minutes',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 25.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      await store['updateMetrics']()

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
    })

    it('should not crash if listener throws', async () => {
      const store = MetricsStore.getInstance()
      const badListener = vi.fn().mockImplementation(() => {
        throw new Error('listener error')
      })
      store.subscribe(badListener)

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'test-container',
          image: 'node:20',
          state: 'running',
          status: 'Up 5 minutes',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 25.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      // Should not throw
      await expect(store['updateMetrics']()).resolves.not.toThrow()
    })
  })

  describe('start / stop', () => {
    it('should start interval', () => {
      const store = MetricsStore.getInstance()
      store.start()
      expect(store['intervalId']).toBeDefined()
      store.stop()
    })

    it('should stop interval', () => {
      const store = MetricsStore.getInstance()
      store.start()
      store.stop()
      expect(store['intervalId']).toBeNull()
    })

    it('should not start interval twice', () => {
      const store = MetricsStore.getInstance()
      store.start()
      const firstInterval = store['intervalId']
      store.start()
      expect(store['intervalId']).toBe(firstInterval)
      store.stop()
    })

    it('should not update metrics when not connected', async () => {
      const store = MetricsStore.getInstance()
      mockDockerClient.isConnected.mockReturnValue(false)

      await store['updateMetrics']()
      expect(store.getMetrics()).toEqual([])
    })
  })

  describe('updateMetrics', () => {
    it('should collect metrics from all containers', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
        {
          id: 'def456',
          name: 'redis',
          image: 'redis:7',
          state: 'running',
          status: 'Up 1 hour',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700001000,
        },
      ])

      mockDockerClient.getContainerStats
        .mockResolvedValueOnce({
          cpuPercent: 15.5,
          memoryUsage: 52428800,
          memoryLimit: 2147483648,
          memoryPercent: 2.44,
        })
        .mockResolvedValueOnce({
          cpuPercent: 5.2,
          memoryUsage: 26214400,
          memoryLimit: 1073741824,
          memoryPercent: 2.44,
        })

      await store['updateMetrics']()

      const metrics = store.getMetrics()
      expect(metrics).toHaveLength(2)
      expect(metrics.find((m) => m.containerId === 'abc123')).toMatchObject({
        containerName: 'nginx',
        cpuPercent: 15.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })
      expect(metrics.find((m) => m.containerId === 'def456')).toMatchObject({
        containerName: 'redis',
        cpuPercent: 5.2,
        memoryUsage: 26214400,
        memoryLimit: 1073741824,
        memoryPercent: 2.44,
      })
    })

    it('should skip containers with null stats', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])

      mockDockerClient.getContainerStats.mockResolvedValue(null)

      await store['updateMetrics']()

      expect(store.getMetrics()).toEqual([])
    })

    it('should handle container removal between calls', async () => {
      const store = MetricsStore.getInstance()

      // First call: container exists
      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 15.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      await store['updateMetrics']()
      expect(store.getMetrics()).toHaveLength(1)

      // Second call: container removed
      mockDockerClient.getContainers.mockResolvedValue([])
      mockDockerClient.getContainerStats.mockReset()

      await store['updateMetrics']()
      expect(store.getMetrics()).toEqual([])
    })

    it('should handle errors gracefully when getting stats', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
        {
          id: 'def456',
          name: 'redis',
          image: 'redis:7',
          state: 'running',
          status: 'Up 1 hour',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700001000,
        },
      ])

      // First container succeeds, second throws
      mockDockerClient.getContainerStats
        .mockResolvedValueOnce({
          cpuPercent: 15.5,
          memoryUsage: 52428800,
          memoryLimit: 2147483648,
          memoryPercent: 2.44,
        })
        .mockRejectedValue(new Error('container not found'))

      await expect(store['updateMetrics']()).resolves.not.toThrow()

      const metrics = store.getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].containerId).toBe('abc123')
    })

    it('should handle Docker client disconnect gracefully', async () => {
      const store = MetricsStore.getInstance()
      mockDockerClient.isConnected.mockReturnValue(false)

      await expect(store['updateMetrics']()).resolves.not.toThrow()
      expect(store.getMetrics()).toEqual([])
    })
  })

  describe('getMetrics', () => {
    it('should return latest entry for each container', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 15.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      await store['updateMetrics']()

      const metrics = store.getMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].containerId).toBe('abc123')
      expect(metrics[0].cpuPercent).toBe(15.5)
    })

    it('should return empty array when no metrics collected', () => {
      const store = MetricsStore.getInstance()
      expect(store.getMetrics()).toEqual([])
    })

    it('should return history for specific container', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 15.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      await store['updateMetrics']()

      const history = store.getHistory('abc123')
      expect(history).toHaveLength(1)
      expect(history[0].containerId).toBe('abc123')
      expect(history[0].cpuPercent).toBe(15.5)
    })
  })

  describe('history accumulation', () => {
    it('should accumulate history across multiple updates', async () => {
      const store = MetricsStore.getInstance(100, 100) // Large max to avoid trimming

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])

      mockDockerClient.getContainerStats
        .mockResolvedValueOnce({
          cpuPercent: 10.0,
          memoryUsage: 52428800,
          memoryLimit: 2147483648,
          memoryPercent: 2.44,
        })
        .mockResolvedValueOnce({
          cpuPercent: 20.0,
          memoryUsage: 62914560,
          memoryLimit: 2147483648,
          memoryPercent: 2.93,
        })
        .mockResolvedValueOnce({
          cpuPercent: 30.0,
          memoryUsage: 73400320,
          memoryLimit: 2147483648,
          memoryPercent: 3.42,
        })

      await store['updateMetrics']()
      expect(store.getHistoryLength('abc123')).toBe(1)

      await store['updateMetrics']()
      expect(store.getHistoryLength('abc123')).toBe(2)

      await store['updateMetrics']()
      expect(store.getHistoryLength('abc123')).toBe(3)

      const history = store.getHistory('abc123')
      expect(history[0].cpuPercent).toBe(10.0)
      expect(history[1].cpuPercent).toBe(20.0)
      expect(history[2].cpuPercent).toBe(30.0)
    })

    it('should trim history when maxEntries is reached', async () => {
      const store = MetricsStore.getInstance(100, 3) // Max 3 entries

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])

      for (let i = 1; i <= 5; i++) {
        mockDockerClient.getContainerStats.mockResolvedValueOnce({
          cpuPercent: i * 10.0,
          memoryUsage: 52428800 * i,
          memoryLimit: 2147483648,
          memoryPercent: 2.44 * i,
        })
        await store['updateMetrics']()
      }

      // Should only have 3 entries (maxEntries)
      expect(store.getHistoryLength('abc123')).toBe(3)

      const history = store.getHistory('abc123')
      // Should have the last 3 entries: 30, 40, 50
      expect(history[0].cpuPercent).toBe(30.0)
      expect(history[1].cpuPercent).toBe(40.0)
      expect(history[2].cpuPercent).toBe(50.0)
    })
  })

  describe('getContainerNames', () => {
    it('should return names of containers with metrics', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
        {
          id: 'def456',
          name: 'redis',
          image: 'redis:7',
          state: 'running',
          status: 'Up 1 hour',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700001000,
        },
      ])

      mockDockerClient.getContainerStats
        .mockResolvedValueOnce({
          cpuPercent: 15.5,
          memoryUsage: 52428800,
          memoryLimit: 2147483648,
          memoryPercent: 2.44,
        })
        .mockResolvedValueOnce({
          cpuPercent: 5.2,
          memoryUsage: 26214400,
          memoryLimit: 1073741824,
          memoryPercent: 2.44,
        })

      await store['updateMetrics']()

      const names = store.getContainerNames()
      expect(names).toContain('nginx')
      expect(names).toContain('redis')
      expect(names).toHaveLength(2)
    })
  })

  describe('getContainerIds', () => {
    it('should return ids of containers with metrics', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 15.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      await store['updateMetrics']()

      const ids = store.getContainerIds()
      expect(ids).toContain('abc123')
      expect(ids).toHaveLength(1)
    })
  })

  describe('getter methods', () => {
    it('should return correct cpu percent', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 42.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      await store['updateMetrics']()
      expect(store.getCpuPercent('abc123')).toBe(42.5)
    })

    it('should return correct memory percent', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 15.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      await store['updateMetrics']()
      expect(store.getMemoryPercent('abc123')).toBe(2.44)
    })

    it('should return correct memory usage', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 15.5,
        memoryUsage: 104857600,
        memoryLimit: 2147483648,
        memoryPercent: 4.88,
      })

      await store['updateMetrics']()
      expect(store.getMemoryUsage('abc123')).toBe(104857600)
    })

    it('should return correct memory limit', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 15.5,
        memoryUsage: 52428800,
        memoryLimit: 4294967296,
        memoryPercent: 1.22,
      })

      await store['updateMetrics']()
      expect(store.getMemoryLimit('abc123')).toBe(4294967296)
    })
  })

  describe('clear', () => {
    it('should clear all metrics', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 15.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      await store['updateMetrics']()
      expect(store.getMetrics()).toHaveLength(1)

      store.clear()
      expect(store.getMetrics()).toEqual([])
      expect(store.getHistoryLength('abc123')).toBe(0)
      expect(store.getTrackedCount()).toBe(0)
    })
  })

  describe('getTrackedCount', () => {
    it('should return correct count of tracked containers', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
        {
          id: 'def456',
          name: 'redis',
          image: 'redis:7',
          state: 'running',
          status: 'Up 1 hour',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700001000,
        },
      ])

      mockDockerClient.getContainerStats
        .mockResolvedValueOnce({
          cpuPercent: 15.5,
          memoryUsage: 52428800,
          memoryLimit: 2147483648,
          memoryPercent: 2.44,
        })
        .mockResolvedValueOnce({
          cpuPercent: 5.2,
          memoryUsage: 26214400,
          memoryLimit: 1073741824,
          memoryPercent: 2.44,
        })

      await store['updateMetrics']()
      expect(store.getTrackedCount()).toBe(2)
    })
  })

  describe('MetricsEntry structure', () => {
    it('should include all required fields', async () => {
      const store = MetricsStore.getInstance()

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.getContainerStats.mockResolvedValue({
        cpuPercent: 15.5,
        memoryUsage: 52428800,
        memoryLimit: 2147483648,
        memoryPercent: 2.44,
      })

      await store['updateMetrics']()

      const metrics = store.getMetrics()
      expect(metrics).toHaveLength(1)

      const entry = metrics[0]
      expect(entry).toHaveProperty('containerId', 'abc123')
      expect(entry).toHaveProperty('containerName', 'nginx')
      expect(entry).toHaveProperty('cpuPercent', 15.5)
      expect(entry).toHaveProperty('memoryUsage', 52428800)
      expect(entry).toHaveProperty('memoryLimit', 2147483648)
      expect(entry).toHaveProperty('memoryPercent', 2.44)
      expect(entry).toHaveProperty('timestamp')
      expect(typeof entry.timestamp).toBe('number')
    })
  })
})
