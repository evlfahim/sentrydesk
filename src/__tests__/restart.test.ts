import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RestartHandler, ContainerLifecycle, ContainerLifecycleStatus } from '../restart/restart'
import { DockerClient } from '../docker/client'

describe('Container Lifecycle — RestartHandler', () => {
  let mockDockerClient: {
    isConnected: ReturnType<typeof vi.fn>
    getContainers: ReturnType<typeof vi.fn>
    restartContainer: ReturnType<typeof vi.fn>
    stopContainer: ReturnType<typeof vi.fn>
    startContainer: ReturnType<typeof vi.fn>
    removeContainer: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    RestartHandler['instance'] = null

    // Create a mock DockerClient
    mockDockerClient = {
      isConnected: vi.fn().mockReturnValue(true),
      getContainers: vi.fn().mockResolvedValue([]),
      restartContainer: vi.fn().mockResolvedValue(undefined),
      stopContainer: vi.fn().mockResolvedValue(undefined),
      startContainer: vi.fn().mockResolvedValue(undefined),
      removeContainer: vi.fn().mockResolvedValue(undefined),
    }

    // Replace the DockerClient singleton with our mock
    ;(DockerClient as any).instance = mockDockerClient
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Singleton ──────────────────────────────────────────────────────────

  describe('singleton', () => {
    it('should create a singleton instance', () => {
      const handler1 = RestartHandler.getInstance()
      const handler2 = RestartHandler.getInstance()
      expect(handler1).toBe(handler2)
    })
  })

  // ── Initial state ──────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should return undefined for unknown container lifecycle', () => {
      const handler = RestartHandler.getInstance()
      expect(handler.getLifecycle('unknown-container')).toBeUndefined()
    })

    it('should return empty array for all lifecycles', () => {
      const handler = RestartHandler.getInstance()
      expect(handler.getAllLifecycles()).toEqual([])
    })

    it('should return 0 tracked count initially', () => {
      const handler = RestartHandler.getInstance()
      expect(handler.getTrackedCount()).toBe(0)
    })
  })

  // ── Connection guard ───────────────────────────────────────────────────

  describe('connection guard', () => {
    it('should throw when restarting without connection', async () => {
      const handler = RestartHandler.getInstance()
      mockDockerClient.isConnected.mockReturnValue(false)

      await expect(handler.restartContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })

    it('should throw when stopping without connection', async () => {
      const handler = RestartHandler.getInstance()
      mockDockerClient.isConnected.mockReturnValue(false)

      await expect(handler.stopContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })

    it('should throw when starting without connection', async () => {
      const handler = RestartHandler.getInstance()
      mockDockerClient.isConnected.mockReturnValue(false)

      await expect(handler.startContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })

    it('should throw when removing without connection', async () => {
      const handler = RestartHandler.getInstance()
      mockDockerClient.isConnected.mockReturnValue(false)

      await expect(handler.removeContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })
  })

  // ── Lifecycle status mapping ───────────────────────────────────────────

  describe('state mapping', () => {
    it('should map "running" to "running"', () => {
      const handler = RestartHandler.getInstance()
      expect(handler['mapState']('running')).toBe('running')
    })

    it('should map "exited" to "exited"', () => {
      const handler = RestartHandler.getInstance()
      expect(handler['mapState']('exited')).toBe('exited')
    })

    it('should map "paused" to "paused"', () => {
      const handler = RestartHandler.getInstance()
      expect(handler['mapState']('paused')).toBe('paused')
    })

    it('should map "restarting" to "restarting"', () => {
      const handler = RestartHandler.getInstance()
      expect(handler['mapState']('restarting')).toBe('restarting')
    })

    it('should map "removing" to "removing"', () => {
      const handler = RestartHandler.getInstance()
      expect(handler['mapState']('removing')).toBe('removing')
    })

    it('should map "created" to "created"', () => {
      const handler = RestartHandler.getInstance()
      expect(handler['mapState']('created')).toBe('created')
    })

    it('should map "dead" to "dead"', () => {
      const handler = RestartHandler.getInstance()
      expect(handler['mapState']('dead')).toBe('dead')
    })

    it('should map unknown states to "unknown"', () => {
      const handler = RestartHandler.getInstance()
      expect(handler['mapState']('foobar')).toBe('unknown')
    })

    it('should handle case-insensitive state mapping', () => {
      const handler = RestartHandler.getInstance()
      expect(handler['mapState']('Running')).toBe('running')
      expect(handler['mapState']('RUNNING')).toBe('running')
      expect(handler['mapState']('Exited')).toBe('exited')
    })
  })

  // ── Container restart ──────────────────────────────────────────────────

  describe('restartContainer', () => {
    it('should set status to restarting, then refresh to running', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

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

      const result = await handler.restartContainer('abc123')

      // Should have been called twice: once for restarting, once for refresh
      expect(listener).toHaveBeenCalledTimes(2)

      // First call: restarting (name falls back to short ID since not yet known)
      expect(listener.mock.calls[0][0]).toMatchObject({
        containerId: 'abc123',
        status: 'restarting',
        lastAction: 'restart',
      })

      // Second call: running (refreshed)
      expect(listener.mock.calls[1][0]).toMatchObject({
        containerId: 'abc123',
        containerName: 'nginx',
        status: 'running',
        lastAction: 'refresh',
      })

      expect(result.status).toBe('running')
      expect(result.lastAction).toBe('refresh')
      expect(mockDockerClient.restartContainer).toHaveBeenCalledWith('abc123')
    })

    it('should use short ID as name when no container info available', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

      // Container not found — will try to use stored name, fall back to short ID
      mockDockerClient.getContainers.mockResolvedValue([])
      mockDockerClient.restartContainer.mockRejectedValue(new Error('No such container'))

      await expect(handler.restartContainer('abc123def456')).rejects.toThrow(
        'No such container',
      )

      // Should have been called twice: restarting + error (container not found during silent refresh)
      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[0][0]).toMatchObject({
        containerId: 'abc123def456',
        containerName: 'abc123def456',
        status: 'restarting',
        lastAction: 'restart',
      })
      // Second call: error with short ID fallback
      expect(listener.mock.calls[1][0]).toMatchObject({
        containerId: 'abc123def456',
        containerName: 'abc123def456',
        status: 'restarting',
        lastAction: 'restart',
        error: 'No such container',
      })
    })

    it('should report error on restart failure', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

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
      mockDockerClient.restartContainer.mockRejectedValue(new Error('connection refused'))

      await expect(handler.restartContainer('abc123')).rejects.toThrow(
        'Failed to restart container abc123: connection refused',
      )

      // Should have been called twice: restarting + error
      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[1][0]).toMatchObject({
        containerId: 'abc123',
        status: 'running',
        lastAction: 'restart',
        error: 'connection refused',
      })
    })

    it('should persist lifecycle state after restart', async () => {
      const handler = RestartHandler.getInstance()

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

      await handler.restartContainer('abc123')

      const lifecycle = handler.getLifecycle('abc123')
      expect(lifecycle).toBeDefined()
      expect(lifecycle!.containerId).toBe('abc123')
      expect(lifecycle!.containerName).toBe('nginx')
      expect(lifecycle!.status).toBe('running')
      expect(lifecycle!.lastAction).toBe('refresh')
      expect(lifecycle!.lastActionTime).toBeGreaterThan(0)
    })
  })

  // ── Container stop ─────────────────────────────────────────────────────

  describe('stopContainer', () => {
    it('should set status to stopped, then refresh', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'exited',
          status: 'Exited (0) 1 second ago',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])

      const result = await handler.stopContainer('abc123')

      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[0][0]).toMatchObject({
        containerId: 'abc123',
        status: 'stopped',
        lastAction: 'stop',
      })
      expect(listener.mock.calls[1][0]).toMatchObject({
        containerId: 'abc123',
        status: 'exited',
        lastAction: 'refresh',
      })
      expect(result.status).toBe('exited')
      expect(mockDockerClient.stopContainer).toHaveBeenCalledWith('abc123')
    })

    it('should report error on stop failure', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

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
      mockDockerClient.stopContainer.mockRejectedValue(new Error('container not found'))

      await expect(handler.stopContainer('abc123')).rejects.toThrow(
        'Failed to stop container abc123: container not found',
      )

      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[1][0]).toMatchObject({
        containerId: 'abc123',
        status: 'running',
        lastAction: 'stop',
        error: 'container not found',
      })
    })
  })

  // ── Container start ────────────────────────────────────────────────────

  describe('startContainer', () => {
    it('should set status to running, then refresh', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

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

      const result = await handler.startContainer('abc123')

      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[0][0]).toMatchObject({
        containerId: 'abc123',
        status: 'running',
        lastAction: 'start',
      })
      expect(listener.mock.calls[1][0]).toMatchObject({
        containerId: 'abc123',
        status: 'running',
        lastAction: 'refresh',
      })
      expect(result.status).toBe('running')
      expect(mockDockerClient.startContainer).toHaveBeenCalledWith('abc123')
    })

    it('should report error on start failure', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'exited',
          status: 'Exited (0) 1 day ago',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])
      mockDockerClient.startContainer.mockRejectedValue(new Error('no such container'))

      await expect(handler.startContainer('abc123')).rejects.toThrow(
        'Failed to start container abc123: no such container',
      )

      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[1][0]).toMatchObject({
        containerId: 'abc123',
        status: 'exited',
        lastAction: 'start',
        error: 'no such container',
      })
    })
  })

  // ── Container remove ───────────────────────────────────────────────────

  describe('removeContainer', () => {
    it('should set status to removing, then dead', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

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

      const result = await handler.removeContainer('abc123')

      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[0][0]).toMatchObject({
        containerId: 'abc123',
        status: 'removing',
        lastAction: 'remove',
      })
      expect(listener.mock.calls[1][0]).toMatchObject({
        containerId: 'abc123',
        status: 'dead',
        lastAction: 'remove',
      })
      expect(result.status).toBe('dead')
      expect(mockDockerClient.removeContainer).toHaveBeenCalledWith('abc123', false)
    })

    it('should use "force-remove" as lastAction when force=true', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

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

      await handler.removeContainer('abc123', true)

      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[0][0].lastAction).toBe('force-remove')
      expect(listener.mock.calls[1][0].lastAction).toBe('force-remove')
      expect(mockDockerClient.removeContainer).toHaveBeenCalledWith('abc123', true)
    })

    it('should report error on remove failure', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

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
      mockDockerClient.removeContainer.mockRejectedValue(new Error('container is running'))

      await expect(handler.removeContainer('abc123')).rejects.toThrow(
        'Failed to remove container abc123: container is running',
      )

      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[1][0]).toMatchObject({
        containerId: 'abc123',
        status: 'running',
        lastAction: 'remove',
        error: 'container is running',
      })
    })
  })

  // ── Subscribe / unsubscribe ────────────────────────────────────────────

  describe('subscribe / unsubscribe', () => {
    it('should call listener on lifecycle update', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

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

      await handler.restartContainer('abc123')

      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[0][0]).toMatchObject({
        containerId: 'abc123',
        status: 'restarting',
      })
    })

    it('should not call listener after unsubscribe', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      const unsubscribe = handler.subscribe(listener)

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

      await handler.restartContainer('abc123')
      expect(listener).toHaveBeenCalledTimes(2)

      unsubscribe()

      // Second restart should not notify
      await handler.restartContainer('abc123')
      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('should support multiple listeners', async () => {
      const handler = RestartHandler.getInstance()
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      handler.subscribe(listener1)
      handler.subscribe(listener2)

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

      await handler.restartContainer('abc123')

      expect(listener1).toHaveBeenCalledTimes(2)
      expect(listener2).toHaveBeenCalledTimes(2)
    })

    it('should not crash if listener throws', async () => {
      const handler = RestartHandler.getInstance()
      const badListener = vi.fn().mockImplementation(() => {
        throw new Error('listener error')
      })
      handler.subscribe(badListener)

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

      // Should not throw
      await expect(handler.restartContainer('abc123')).resolves.not.toThrow()
    })
  })

  // ── refreshAllContainers ───────────────────────────────────────────────

  describe('refreshAllContainers', () => {
    it('should refresh all containers and notify listeners', async () => {
      const handler = RestartHandler.getInstance()
      const listener = vi.fn()
      handler.subscribe(listener)

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
          state: 'exited',
          status: 'Exited (0) 1 day ago',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700001000,
        },
      ])

      const results = await handler.refreshAllContainers()

      expect(results).toHaveLength(2)
      expect(results[0]).toMatchObject({
        containerId: 'abc123',
        containerName: 'nginx',
        status: 'running',
        lastAction: 'refresh',
      })
      expect(results[1]).toMatchObject({
        containerId: 'def456',
        containerName: 'redis',
        status: 'exited',
        lastAction: 'refresh',
      })
      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('should throw when not connected', async () => {
      const handler = RestartHandler.getInstance()
      mockDockerClient.isConnected.mockReturnValue(false)

      await expect(handler.refreshAllContainers()).rejects.toThrow(
        'Docker client not connected',
      )
    })

    it('should handle empty container list', async () => {
      const handler = RestartHandler.getInstance()
      mockDockerClient.getContainers.mockResolvedValue([])

      const results = await handler.refreshAllContainers()

      expect(results).toEqual([])
    })
  })

  // ── clear ──────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('should remove all lifecycle data', async () => {
      const handler = RestartHandler.getInstance()

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

      await handler.restartContainer('abc123')
      expect(handler.getTrackedCount()).toBe(1)

      handler.clear()

      expect(handler.getTrackedCount()).toBe(0)
      expect(handler.getLifecycle('abc123')).toBeUndefined()
      expect(handler.getAllLifecycles()).toEqual([])
    })
  })

  // ── Lifecycle structure ────────────────────────────────────────────────

  describe('ContainerLifecycle structure', () => {
    it('should have all required fields', async () => {
      const handler = RestartHandler.getInstance()

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

      await handler.restartContainer('abc123')

      const lifecycle = handler.getLifecycle('abc123')
      expect(lifecycle).toBeDefined()
      expect(lifecycle).toHaveProperty('containerId')
      expect(lifecycle).toHaveProperty('containerName')
      expect(lifecycle).toHaveProperty('status')
      expect(lifecycle).toHaveProperty('lastAction')
      expect(lifecycle).toHaveProperty('lastActionTime')
      expect(typeof lifecycle!.containerId).toBe('string')
      expect(typeof lifecycle!.containerName).toBe('string')
      expect(typeof lifecycle!.status).toBe('string')
      expect(typeof lifecycle!.lastAction).toBe('string')
      expect(typeof lifecycle!.lastActionTime).toBe('number')
    })

    it('should have error field on failure', async () => {
      const handler = RestartHandler.getInstance()

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
      mockDockerClient.restartContainer.mockRejectedValue(new Error('fail'))

      await expect(handler.restartContainer('abc123')).rejects.toThrow(
        'Failed to restart container abc123: fail',
      )

      const lifecycle = handler.getLifecycle('abc123')
      expect(lifecycle!.error).toBe('fail')
    })
  })

  // ── Container lifecycle status type ────────────────────────────────────

  describe('ContainerLifecycleStatus type', () => {
    it('should accept all valid status values', () => {
      const handler = RestartHandler.getInstance()
      const validStatuses: ContainerLifecycleStatus[] = [
        'running',
        'stopped',
        'paused',
        'restarting',
        'removing',
        'exited',
        'created',
        'dead',
        'unknown',
      ]

      for (const status of validStatuses) {
        expect(() => handler['mapState'](status)).not.toThrow()
      }
    })
  })

  // ── Lifecycle persistence across actions ───────────────────────────────

  describe('lifecycle persistence', () => {
    it('should update lifecycle on consecutive actions', async () => {
      const handler = RestartHandler.getInstance()

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

      // First restart
      await handler.restartContainer('abc123')
      let lifecycle = handler.getLifecycle('abc123')
      expect(lifecycle!.status).toBe('running')
      expect(lifecycle!.lastAction).toBe('refresh')

      // Second restart
      await handler.restartContainer('abc123')
      lifecycle = handler.getLifecycle('abc123')
      expect(lifecycle!.status).toBe('running')
      expect(lifecycle!.lastAction).toBe('refresh')
    })

    it('should track time progression', async () => {
      const handler = RestartHandler.getInstance()

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

      await handler.restartContainer('abc123')
      const lifecycle1 = handler.getLifecycle('abc123')!

      await new Promise((resolve) => setTimeout(resolve, 10))

      await handler.restartContainer('abc123')
      const lifecycle2 = handler.getLifecycle('abc123')!

      expect(lifecycle2.lastActionTime).toBeGreaterThanOrEqual(lifecycle1.lastActionTime)
    })
  })

  // ── getLifecycle for unknown container ─────────────────────────────────

  describe('getLifecycle for unknown container', () => {
    it('should return undefined for container never tracked', () => {
      const handler = RestartHandler.getInstance()
      expect(handler.getLifecycle('never-seen')).toBeUndefined()
    })
  })

  // ── getAllLifecycles ───────────────────────────────────────────────────

  describe('getAllLifecycles', () => {
    it('should return all tracked lifecycles', async () => {
      const handler = RestartHandler.getInstance()

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
          state: 'exited',
          status: 'Exited (0) 1 day ago',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700001000,
        },
      ])

      await handler.restartContainer('abc123')
      await handler.stopContainer('def456')

      const all = handler.getAllLifecycles()
      expect(all).toHaveLength(2)
      expect(all.find((l) => l.containerId === 'abc123')).toMatchObject({
        containerName: 'nginx',
        status: 'running',
      })
      expect(all.find((l) => l.containerId === 'def456')).toMatchObject({
        containerName: 'redis',
        status: 'exited',
      })
    })
  })
})
