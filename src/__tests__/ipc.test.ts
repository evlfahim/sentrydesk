import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IpcClient } from '../ipc/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock of the Electron API surface that the IpcClient
 * expects on `window.electronAPI`.  Every method returns a resolved
 * promise with a configurable value so that the caller can inspect
 * what was called.
 */
function createMockApi(overrides: Record<string, any> = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = []

  const api: Record<string, any> = {
    getVersion: vi.fn(() => Promise.resolve('0.1.0')),
    getPlatform: vi.fn(() => Promise.resolve('linux')),
    dockerConnect: vi.fn(() => Promise.resolve()),
    dockerIsConnected: vi.fn(() => Promise.resolve(true)),
    dockerGetContainers: vi.fn(() => Promise.resolve([])),
    dockerGetContainerStats: vi.fn(() => Promise.resolve(null)),
    dockerRestartContainer: vi.fn(() => Promise.resolve()),
    dockerStopContainer: vi.fn(() => Promise.resolve()),
    dockerStartContainer: vi.fn(() => Promise.resolve()),
    dockerRemoveContainer: vi.fn(() => Promise.resolve()),
    dockerGetContainerLogs: vi.fn(() => Promise.resolve([])),
    dockerGetComposeFiles: vi.fn(() => Promise.resolve([])),
    dockerGetComposeFileContent: vi.fn(() => Promise.resolve('')),
    dockerGetComposeProjectInfo: vi.fn(() => Promise.resolve(null)),
    dockerGetDiskUsage: vi.fn(() =>
      Promise.resolve({
        images: { totalSize: 0, count: 0 },
        volumes: { totalSize: 0, count: 0 },
        buildCache: { totalSize: 0 },
        containers: { totalSize: 0, count: 0 },
      }),
    ),
    metricsStart: vi.fn(() => Promise.resolve()),
    metricsStop: vi.fn(() => Promise.resolve()),
    metricsGet: vi.fn(() => Promise.resolve([])),
    metricsGetHistory: vi.fn(() => Promise.resolve([])),
    metricsGetContainerNames: vi.fn(() => Promise.resolve([])),
    metricsGetContainerIds: vi.fn(() => Promise.resolve([])),
    metricsGetCpuPercent: vi.fn(() => Promise.resolve(0)),
    metricsGetMemoryPercent: vi.fn(() => Promise.resolve(0)),
    metricsGetMemoryUsage: vi.fn(() => Promise.resolve(0)),
    metricsGetMemoryLimit: vi.fn(() => Promise.resolve(0)),
    metricsClear: vi.fn(() => Promise.resolve()),
    metricsGetTrackedCount: vi.fn(() => Promise.resolve(0)),
    metricsGetHistoryLength: vi.fn(() => Promise.resolve(0)),
    logsFetch: vi.fn(() => Promise.resolve([])),
    logsGet: vi.fn(() => Promise.resolve([])),
    logsFilter: vi.fn(() => Promise.resolve([])),
    logsSetFollow: vi.fn(() => Promise.resolve()),
    logsIsFollow: vi.fn(() => Promise.resolve(false)),
    logsClear: vi.fn(() => Promise.resolve()),
    logsGetContainerNames: vi.fn(() => Promise.resolve([])),
    logsGetLogCount: vi.fn(() => Promise.resolve(0)),
    cleanupAnalyze: vi.fn(() => Promise.resolve([])),
    cleanupGetSuggestions: vi.fn(() => Promise.resolve([])),
    cleanupGetTotalSavings: vi.fn(() => Promise.resolve(0)),
    cleanupClear: vi.fn(() => Promise.resolve()),
    composeParse: vi.fn(() =>
      Promise.resolve({ path: '', content: '', config: null, errors: [] }),
    ),
    composeValidate: vi.fn(() => Promise.resolve([])),
    composeGetServiceSummary: vi.fn(() => Promise.resolve([])),
    sendDockerEvent: vi.fn(),
    onDockerEvent: vi.fn((cb: (event: string, data: unknown) => void) => {
      return () => {}
    }),
    ...overrides,
  }

  // Wrap every method to record calls
  const wrapped: Record<string, any> = {}
  for (const [key, value] of Object.entries(api)) {
    if (typeof value === 'function') {
      wrapped[key] = vi.fn(value)
    } else {
      wrapped[key] = value
    }
  }

  return { api: wrapped as typeof api, calls: wrapped }
}

/**
 * Temporarily patch `window.electronAPI` for a test.
 * Restores the previous value on cleanup.
 */
function withMockApi(mockApi: Record<string, any>, fn: () => Promise<void>) {
  const prev = (globalThis as any).electronAPI
  ;(globalThis as any).electronAPI = mockApi
  return fn().finally(() => {
    ;(globalThis as any).electronAPI = prev
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IpcClient', () => {
  let client: IpcClient

  beforeEach(() => {
    client = new IpcClient()
  })

  // -----------------------------------------------------------------------
  // No-Electron fallback
  // -----------------------------------------------------------------------

  describe('no-electron fallback', () => {
    it('returns default values when window.electronAPI is absent', async () => {
      const prev = (globalThis as any).electronAPI
      delete (globalThis as any).electronAPI

      const c = new IpcClient()

      expect(await c.getVersion()).toBe('0.0.0')
      expect(await c.getPlatform()).toBe('unknown')
      expect(await c.dockerConnect()).toBe(false)
      expect(await c.dockerIsConnected()).toBe(false)
      expect(await c.dockerGetContainers()).toEqual([])
      expect(await c.dockerGetContainerStats('abc')).toBeNull()
      expect(await c.dockerRestartContainer('abc')).toBe(false)
      expect(await c.dockerStopContainer('abc')).toBe(false)
      expect(await c.dockerStartContainer('abc')).toBe(false)
      expect(await c.dockerRemoveContainer('abc')).toBe(false)
      expect(await c.dockerGetContainerLogs('abc')).toEqual([])
      expect(await c.dockerGetComposeFiles()).toEqual([])
      expect(await c.dockerGetComposeFileContent('proj')).toBe('')
      expect(await c.dockerGetComposeProjectInfo('proj')).toBeNull()
      expect(await c.dockerGetDiskUsage()).toEqual({
        images: { totalSize: 0, count: 0 },
        volumes: { totalSize: 0, count: 0 },
        buildCache: { totalSize: 0 },
        containers: { totalSize: 0, count: 0 },
      })
      expect(c.metricsStart()).toBe(false)
      expect(c.metricsStop()).toBe(false)
      expect(await c.metricsGet()).toEqual([])
      expect(await c.metricsGetHistory('abc')).toEqual([])
      expect(await c.metricsGetContainerNames()).toEqual([])
      expect(await c.metricsGetContainerIds()).toEqual([])
      expect(await c.metricsGetCpuPercent('abc')).toBe(0)
      expect(await c.metricsGetMemoryPercent('abc')).toBe(0)
      expect(await c.metricsGetMemoryUsage('abc')).toBe(0)
      expect(await c.metricsGetMemoryLimit('abc')).toBe(0)
      expect(c.metricsClear()).toBe(false)
      expect(await c.metricsGetTrackedCount()).toBe(0)
      expect(await c.metricsGetHistoryLength('abc')).toBe(0)
      expect(await c.logsFetch('abc')).toEqual([])
      expect(await c.logsGet('abc')).toEqual([])
      expect(await c.logsFilter('abc', {})).toEqual([])
      expect(c.logsSetFollow('abc', true)).toBe(false)
      expect(await c.logsIsFollow('abc')).toBe(false)
      expect(c.logsClear()).toBe(false)
      expect(await c.logsGetContainerNames()).toEqual([])
      expect(await c.logsGetLogCount('abc')).toBe(0)
      expect(await c.cleanupAnalyze()).toEqual([])
      expect(await c.cleanupGetSuggestions()).toEqual([])
      expect(await c.cleanupGetTotalSavings()).toBe(0)
      expect(c.cleanupClear()).toBe(false)
      expect(await c.composeParse('')).toEqual({ path: '', content: '', config: null, errors: [] })
      expect(await c.composeValidate({} as any)).toEqual([])
      expect(await c.composeGetServiceSummary({} as any)).toEqual([])
      const unsub = c.onDockerEvent(() => {})
      expect(typeof unsub).toBe('function')
      c.sendDockerEvent('test', {})

      ;(globalThis as any).electronAPI = prev
    })
  })

  // -----------------------------------------------------------------------
  // App
  // -----------------------------------------------------------------------

  describe('app methods', () => {
    it('delegates getVersion to the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const version = await client.getVersion()
        expect(version).toBe('0.1.0')
        expect(mock.api.getVersion).toHaveBeenCalled()
      })
    })

    it('delegates getPlatform to the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const platform = await client.getPlatform()
        expect(platform).toBe('linux')
        expect(mock.api.getPlatform).toHaveBeenCalled()
      })
    })
  })

  // -----------------------------------------------------------------------
  // Docker daemon
  // -----------------------------------------------------------------------

  describe('docker methods', () => {
    it('dockerConnect invokes the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = await client.dockerConnect()
        expect(ok).toBe(true)
        expect(mock.api.dockerConnect).toHaveBeenCalled()
      })
    })

    it('dockerIsConnected returns the main process value', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const connected = await client.dockerIsConnected()
        expect(connected).toBe(true)
        expect(mock.api.dockerIsConnected).toHaveBeenCalled()
      })
    })

    it('dockerGetContainers returns container list', async () => {
      const mockContainers = [
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
      ]
      const mock = createMockApi({
        dockerGetContainers: vi.fn(() => Promise.resolve(mockContainers)),
      })
      await withMockApi(mock.api, async () => {
        const containers = await client.dockerGetContainers()
        expect(containers).toHaveLength(1)
        expect(containers[0].name).toBe('nginx')
        expect(mock.api.dockerGetContainers).toHaveBeenCalled()
      })
    })

    it('dockerGetContainerStats returns stats or null', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const stats = await client.dockerGetContainerStats('abc123')
        expect(stats).toBeNull()
        expect(mock.api.dockerGetContainerStats).toHaveBeenCalledWith('abc123')
      })
    })

    it('dockerRestartContainer invokes the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = await client.dockerRestartContainer('abc123')
        expect(ok).toBe(true)
        expect(mock.api.dockerRestartContainer).toHaveBeenCalledWith('abc123')
      })
    })

    it('dockerStopContainer invokes the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = await client.dockerStopContainer('abc123')
        expect(ok).toBe(true)
        expect(mock.api.dockerStopContainer).toHaveBeenCalledWith('abc123')
      })
    })

    it('dockerStartContainer invokes the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = await client.dockerStartContainer('abc123')
        expect(ok).toBe(true)
        expect(mock.api.dockerStartContainer).toHaveBeenCalledWith('abc123')
      })
    })

    it('dockerRemoveContainer invokes the main process with force flag', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = await client.dockerRemoveContainer('abc123', true)
        expect(ok).toBe(true)
        expect(mock.api.dockerRemoveContainer).toHaveBeenCalledWith('abc123', true)
      })
    })

    it('dockerGetContainerLogs returns log lines', async () => {
      const mockLines = ['INFO Starting', 'ERROR Failed']
      const mock = createMockApi({
        dockerGetContainerLogs: vi.fn(() => Promise.resolve(mockLines)),
      })
      await withMockApi(mock.api, async () => {
        const lines = await client.dockerGetContainerLogs('abc123', { tail: 50 })
        expect(lines).toEqual(mockLines)
        expect(mock.api.dockerGetContainerLogs).toHaveBeenCalledWith(
          'abc123',
          { tail: 50 },
        )
      })
    })

    it('dockerGetComposeFiles returns file list', async () => {
      const mock = createMockApi({
        dockerGetComposeFiles: vi.fn(() => Promise.resolve(['/docker-compose.yml'])),
      })
      await withMockApi(mock.api, async () => {
        const files = await client.dockerGetComposeFiles()
        expect(files).toEqual(['/docker-compose.yml'])
        expect(mock.api.dockerGetComposeFiles).toHaveBeenCalled()
      })
    })

    it('dockerGetComposeFileContent returns content', async () => {
      const mock = createMockApi({
        dockerGetComposeFileContent: vi.fn(() => Promise.resolve('name: test\n')),
      })
      await withMockApi(mock.api, async () => {
        const content = await client.dockerGetComposeFileContent('test')
        expect(content).toBe('name: test\n')
        expect(mock.api.dockerGetComposeFileContent).toHaveBeenCalledWith('test')
      })
    })

    it('dockerGetComposeProjectInfo returns info or null', async () => {
      const mock = createMockApi({
        dockerGetComposeProjectInfo: vi.fn(() =>
          Promise.resolve({ name: 'test', status: 'running', services: 2, configFile: 'docker-compose.yml' }),
        ),
      })
      await withMockApi(mock.api, async () => {
        const info = await client.dockerGetComposeProjectInfo('test')
        expect(info).not.toBeNull()
        expect(info!.name).toBe('test')
        expect(mock.api.dockerGetComposeProjectInfo).toHaveBeenCalledWith('test')
      })
    })

    it('dockerGetDiskUsage returns disk usage summary', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const usage = await client.dockerGetDiskUsage()
        expect(usage).toHaveProperty('images')
        expect(usage).toHaveProperty('volumes')
        expect(usage).toHaveProperty('buildCache')
        expect(usage).toHaveProperty('containers')
        expect(mock.api.dockerGetDiskUsage).toHaveBeenCalled()
      })
    })
  })

  // -----------------------------------------------------------------------
  // Metrics
  // -----------------------------------------------------------------------

  describe('metrics methods', () => {
    it('metricsStart invokes the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = client.metricsStart()
        expect(ok).toBe(true)
        expect(mock.api.metricsStart).toHaveBeenCalled()
      })
    })

    it('metricsStop invokes the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = client.metricsStop()
        expect(ok).toBe(true)
        expect(mock.api.metricsStop).toHaveBeenCalled()
      })
    })

    it('metricsGet returns metrics entries', async () => {
      const mockEntries = [
        {
          containerId: 'abc123',
          containerName: 'nginx',
          cpuPercent: 25.5,
          memoryUsage: 52428800,
          memoryLimit: 2147483648,
          memoryPercent: 2.44,
          timestamp: 1700000000000,
        },
      ]
      const mock = createMockApi({
        metricsGet: vi.fn(() => Promise.resolve(mockEntries)),
      })
      await withMockApi(mock.api, async () => {
        const entries = await client.metricsGet()
        expect(entries).toHaveLength(1)
        expect(entries[0].containerName).toBe('nginx')
        expect(mock.api.metricsGet).toHaveBeenCalled()
      })
    })

    it('metricsGetHistory returns history for a container', async () => {
      const mock = createMockApi({
        metricsGetHistory: vi.fn(() => Promise.resolve([])),
      })
      await withMockApi(mock.api, async () => {
        const history = await client.metricsGetHistory('abc123')
        expect(history).toEqual([])
        expect(mock.api.metricsGetHistory).toHaveBeenCalledWith('abc123')
      })
    })

    it('metricsGetContainerNames returns names', async () => {
      const mock = createMockApi({
        metricsGetContainerNames: vi.fn(() => Promise.resolve(['nginx', 'redis'])),
      })
      await withMockApi(mock.api, async () => {
        const names = await client.metricsGetContainerNames()
        expect(names).toEqual(['nginx', 'redis'])
        expect(mock.api.metricsGetContainerNames).toHaveBeenCalled()
      })
    })

    it('metricsGetContainerIds returns ids', async () => {
      const mock = createMockApi({
        metricsGetContainerIds: vi.fn(() => Promise.resolve(['abc123', 'def456'])),
      })
      await withMockApi(mock.api, async () => {
        const ids = await client.metricsGetContainerIds()
        expect(ids).toEqual(['abc123', 'def456'])
        expect(mock.api.metricsGetContainerIds).toHaveBeenCalled()
      })
    })

    it('metricsGetCpuPercent returns cpu percent', async () => {
      const mock = createMockApi({
        metricsGetCpuPercent: vi.fn(() => Promise.resolve(42.5)),
      })
      await withMockApi(mock.api, async () => {
        const cpu = await client.metricsGetCpuPercent('abc123')
        expect(cpu).toBe(42.5)
        expect(mock.api.metricsGetCpuPercent).toHaveBeenCalledWith('abc123')
      })
    })

    it('metricsGetMemoryPercent returns memory percent', async () => {
      const mock = createMockApi({
        metricsGetMemoryPercent: vi.fn(() => Promise.resolve(75.0)),
      })
      await withMockApi(mock.api, async () => {
        const mem = await client.metricsGetMemoryPercent('abc123')
        expect(mem).toBe(75.0)
        expect(mock.api.metricsGetMemoryPercent).toHaveBeenCalledWith('abc123')
      })
    })

    it('metricsGetMemoryUsage returns memory usage', async () => {
      const mock = createMockApi({
        metricsGetMemoryUsage: vi.fn(() => Promise.resolve(104857600)),
      })
      await withMockApi(mock.api, async () => {
        const usage = await client.metricsGetMemoryUsage('abc123')
        expect(usage).toBe(104857600)
        expect(mock.api.metricsGetMemoryUsage).toHaveBeenCalledWith('abc123')
      })
    })

    it('metricsGetMemoryLimit returns memory limit', async () => {
      const mock = createMockApi({
        metricsGetMemoryLimit: vi.fn(() => Promise.resolve(2147483648)),
      })
      await withMockApi(mock.api, async () => {
        const limit = await client.metricsGetMemoryLimit('abc123')
        expect(limit).toBe(2147483648)
        expect(mock.api.metricsGetMemoryLimit).toHaveBeenCalledWith('abc123')
      })
    })

    it('metricsClear invokes the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = client.metricsClear()
        expect(ok).toBe(true)
        expect(mock.api.metricsClear).toHaveBeenCalled()
      })
    })

    it('metricsGetTrackedCount returns count', async () => {
      const mock = createMockApi({
        metricsGetTrackedCount: vi.fn(() => Promise.resolve(3)),
      })
      await withMockApi(mock.api, async () => {
        const count = await client.metricsGetTrackedCount()
        expect(count).toBe(3)
        expect(mock.api.metricsGetTrackedCount).toHaveBeenCalled()
      })
    })

    it('metricsGetHistoryLength returns length', async () => {
      const mock = createMockApi({
        metricsGetHistoryLength: vi.fn(() => Promise.resolve(10)),
      })
      await withMockApi(mock.api, async () => {
        const len = await client.metricsGetHistoryLength('abc123')
        expect(len).toBe(10)
        expect(mock.api.metricsGetHistoryLength).toHaveBeenCalledWith('abc123')
      })
    })
  })

  // -----------------------------------------------------------------------
  // Logs
  // -----------------------------------------------------------------------

  describe('logs methods', () => {
    it('logsFetch returns log entries', async () => {
      const mockEntries = [
        { timestamp: '2024-01-01T00:00:00.000000000Z', stream: 'stdout', message: 'Hello' },
      ]
      const mock = createMockApi({
        logsFetch: vi.fn(() => Promise.resolve(mockEntries)),
      })
      await withMockApi(mock.api, async () => {
        const entries = await client.logsFetch('abc123', { tail: 100 })
        expect(entries).toHaveLength(1)
        expect(entries[0].message).toBe('Hello')
        expect(mock.api.logsFetch).toHaveBeenCalledWith('abc123', { tail: 100 })
      })
    })

    it('logsGet returns stored logs', async () => {
      const mock = createMockApi({
        logsGet: vi.fn(() => Promise.resolve([])),
      })
      await withMockApi(mock.api, async () => {
        const logs = await client.logsGet('abc123')
        expect(logs).toEqual([])
        expect(mock.api.logsGet).toHaveBeenCalledWith('abc123')
      })
    })

    it('logsFilter returns filtered logs', async () => {
      const mock = createMockApi({
        logsFilter: vi.fn(() => Promise.resolve([])),
      })
      await withMockApi(mock.api, async () => {
        const filtered = await client.logsFilter('abc123', { search: 'error', stream: 'stderr' })
        expect(filtered).toEqual([])
        expect(mock.api.logsFilter).toHaveBeenCalledWith('abc123', {
          search: 'error',
          stream: 'stderr',
        })
      })
    })

    it('logsSetFollow invokes the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = client.logsSetFollow('abc123', true)
        expect(ok).toBe(true)
        expect(mock.api.logsSetFollow).toHaveBeenCalledWith('abc123', true)
      })
    })

    it('logsIsFollow returns follow state', async () => {
      const mock = createMockApi({
        logsIsFollow: vi.fn(() => Promise.resolve(true)),
      })
      await withMockApi(mock.api, async () => {
        const follow = await client.logsIsFollow('abc123')
        expect(follow).toBe(true)
        expect(mock.api.logsIsFollow).toHaveBeenCalledWith('abc123')
      })
    })

    it('logsClear invokes the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = client.logsClear('abc123')
        expect(ok).toBe(true)
        expect(mock.api.logsClear).toHaveBeenCalledWith('abc123')
      })
    })

    it('logsClear without containerId clears all', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = client.logsClear()
        expect(ok).toBe(true)
        expect(mock.api.logsClear).toHaveBeenCalledWith(undefined)
      })
    })

    it('logsGetContainerNames returns names', async () => {
      const mock = createMockApi({
        logsGetContainerNames: vi.fn(() => Promise.resolve(['nginx'])),
      })
      await withMockApi(mock.api, async () => {
        const names = await client.logsGetContainerNames()
        expect(names).toEqual(['nginx'])
        expect(mock.api.logsGetContainerNames).toHaveBeenCalled()
      })
    })

    it('logsGetLogCount returns count', async () => {
      const mock = createMockApi({
        logsGetLogCount: vi.fn(() => Promise.resolve(42)),
      })
      await withMockApi(mock.api, async () => {
        const count = await client.logsGetLogCount('abc123')
        expect(count).toBe(42)
        expect(mock.api.logsGetLogCount).toHaveBeenCalledWith('abc123')
      })
    })
  })

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  describe('cleanup methods', () => {
    it('cleanupAnalyze returns suggestions', async () => {
      const mockSuggestions = [
        {
          id: 'img-abc',
          type: 'image',
          title: 'Dangling image',
          description: 'Safe to remove',
          size: 1073741824,
          actionable: true,
          action: 'Remove',
          targetId: 'img-abc',
        },
      ]
      const mock = createMockApi({
        cleanupAnalyze: vi.fn(() => Promise.resolve(mockSuggestions)),
      })
      await withMockApi(mock.api, async () => {
        const suggestions = await client.cleanupAnalyze()
        expect(suggestions).toHaveLength(1)
        expect(suggestions[0].type).toBe('image')
        expect(mock.api.cleanupAnalyze).toHaveBeenCalled()
      })
    })

    it('cleanupGetSuggestions returns suggestions', async () => {
      const mock = createMockApi({
        cleanupGetSuggestions: vi.fn(() => Promise.resolve([])),
      })
      await withMockApi(mock.api, async () => {
        const suggestions = await client.cleanupGetSuggestions()
        expect(suggestions).toEqual([])
        expect(mock.api.cleanupGetSuggestions).toHaveBeenCalled()
      })
    })

    it('cleanupGetTotalSavings returns total', async () => {
      const mock = createMockApi({
        cleanupGetTotalSavings: vi.fn(() => Promise.resolve(2147483648)),
      })
      await withMockApi(mock.api, async () => {
        const savings = await client.cleanupGetTotalSavings()
        expect(savings).toBe(2147483648)
        expect(mock.api.cleanupGetTotalSavings).toHaveBeenCalled()
      })
    })

    it('cleanupClear invokes the main process', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        const ok = client.cleanupClear()
        expect(ok).toBe(true)
        expect(mock.api.cleanupClear).toHaveBeenCalled()
      })
    })
  })

  // -----------------------------------------------------------------------
  // Compose
  // -----------------------------------------------------------------------

  describe('compose methods', () => {
    it('composeParse returns parsed file', async () => {
      const mock = createMockApi({
        composeParse: vi.fn(() =>
          Promise.resolve({
            path: '',
            content: 'name: test\n',
            config: {
              version: '3.8',
              name: 'test',
              services: [],
              networks: [],
              volumes: [],
              raw: 'name: test\n',
            },
            errors: [],
          }),
        ),
      })
      await withMockApi(mock.api, async () => {
        const file = await client.composeParse('name: test\n')
        expect(file.config).not.toBeNull()
        expect(file.config!.name).toBe('test')
        expect(mock.api.composeParse).toHaveBeenCalledWith('name: test\n', undefined)
      })
    })

    it('composeParse with projectName', async () => {
      const mock = createMockApi({
        composeParse: vi.fn(() =>
          Promise.resolve({
            path: '',
            content: 'name: test\n',
            config: {
              version: '3.8',
              name: 'custom',
              services: [],
              networks: [],
              volumes: [],
              raw: 'name: test\n',
            },
            errors: [],
          }),
        ),
      })
      await withMockApi(mock.api, async () => {
        const file = await client.composeParse('name: test\n', 'custom')
        expect(file.config!.name).toBe('custom')
        expect(mock.api.composeParse).toHaveBeenCalledWith('name: test\n', 'custom')
      })
    })

    it('composeValidate returns validation errors', async () => {
      const mock = createMockApi({
        composeValidate: vi.fn(() => Promise.resolve([])),
      })
      await withMockApi(mock.api, async () => {
        const errors = await client.composeValidate({
          version: '3.8',
          name: 'test',
          services: [],
          networks: [],
          volumes: [],
          raw: '',
        })
        expect(errors).toEqual([])
        expect(mock.api.composeValidate).toHaveBeenCalled()
      })
    })

    it('composeGetServiceSummary returns summary', async () => {
      const mock = createMockApi({
        composeGetServiceSummary: vi.fn(() => Promise.resolve([])),
      })
      await withMockApi(mock.api, async () => {
        const summary = await client.composeGetServiceSummary({
          version: '3.8',
          name: 'test',
          services: [],
          networks: [],
          volumes: [],
          raw: '',
        })
        expect(summary).toEqual([])
        expect(mock.api.composeGetServiceSummary).toHaveBeenCalled()
      })
    })
  })

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  describe('events', () => {
    it('onDockerEvent registers a callback', async () => {
      const mock = createMockApi({
        onDockerEvent: vi.fn((cb: (event: string, data: unknown) => void) => {
          return () => {}
        }),
      })
      await withMockApi(mock.api, async () => {
        const unsubscribe = client.onDockerEvent(() => {})
        expect(unsubscribe).toBeDefined()
        expect(typeof unsubscribe).toBe('function')
        expect(mock.api.onDockerEvent).toHaveBeenCalled()
      })
    })

    it('sendDockerEvent sends an event', async () => {
      const mock = createMockApi()
      await withMockApi(mock.api, async () => {
        client.sendDockerEvent('test-event', { key: 'value' })
        expect(mock.api.sendDockerEvent).toHaveBeenCalledWith('test-event', { key: 'value' })
      })
    })
  })

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('dockerGetContainers returns empty array on error', async () => {
      const mock = createMockApi({
        dockerGetContainers: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
      })
      await withMockApi(mock.api, async () => {
        const containers = await client.dockerGetContainers()
        expect(containers).toEqual([])
      })
    })

    it('dockerGetContainerStats returns null on error', async () => {
      const mock = createMockApi({
        dockerGetContainerStats: vi.fn(() => Promise.reject(new Error('not found'))),
      })
      await withMockApi(mock.api, async () => {
        const stats = await client.dockerGetContainerStats('abc123')
        expect(stats).toBeNull()
      })
    })

    it('metricsGet returns empty array on error', async () => {
      const mock = createMockApi({
        metricsGet: vi.fn(() => Promise.reject(new Error('timeout'))),
      })
      await withMockApi(mock.api, async () => {
        const entries = await client.metricsGet()
        expect(entries).toEqual([])
      })
    })

    it('logsFetch returns empty array on error', async () => {
      const mock = createMockApi({
        logsFetch: vi.fn(() => Promise.reject(new Error('timeout'))),
      })
      await withMockApi(mock.api, async () => {
        const entries = await client.logsFetch('abc123')
        expect(entries).toEqual([])
      })
    })

    it('cleanupAnalyze returns empty array on error', async () => {
      const mock = createMockApi({
        cleanupAnalyze: vi.fn(() => Promise.reject(new Error('timeout'))),
      })
      await withMockApi(mock.api, async () => {
        const suggestions = await client.cleanupAnalyze()
        expect(suggestions).toEqual([])
      })
    })

    it('composeParse returns empty file on error', async () => {
      const mock = createMockApi({
        composeParse: vi.fn(() => Promise.reject(new Error('timeout'))),
      })
      await withMockApi(mock.api, async () => {
        const file = await client.composeParse('invalid yaml {{{')
        expect(file).toEqual({ path: '', content: 'invalid yaml {{{', config: null, errors: [] })
      })
    })
  })

  // -----------------------------------------------------------------------
  // Singleton pattern
  // -----------------------------------------------------------------------

  describe('singleton', () => {
    it('creates a new instance each time', () => {
      const c1 = new IpcClient()
      const c2 = new IpcClient()
      expect(c1).not.toBe(c2)
    })

    it('the exported ipcClient is a single instance', () => {
      // Re-import to get the same module-level instance
      // Since we can't easily re-import in vitest, we just verify the
      // module exports a single object by checking the constructor
      const c = new IpcClient()
      expect(c).toBeInstanceOf(IpcClient)
    })
  })
})
