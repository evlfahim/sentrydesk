import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DockerClient } from '../docker/client'
import { CleanupEngine, CleanupSuggestion } from '../disk/cleanup'

// Mock Dockerode (same pattern as docker-client.test.ts)
const mockPing = vi.fn()
const mockListContainers = vi.fn()
const mockListImages = vi.fn()
const mockListVolumes = vi.fn()
const mockGetContainer = vi.fn()

vi.mock('dockerode', () => {
  return {
    default: vi.fn(() => ({
      ping: mockPing,
      listContainers: mockListContainers,
      listImages: mockListImages,
      listVolumes: mockListVolumes,
      getContainer: mockGetContainer,
    })),
  }
})

describe('Disk Space — CleanupEngine', () => {
  let mockDockerClient: {
    isConnected: ReturnType<typeof vi.fn>
    getContainers: ReturnType<typeof vi.fn>
    getDocker: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    CleanupEngine['instance'] = null
    ;(DockerClient as any).instance = null

    mockDockerClient = {
      isConnected: vi.fn().mockReturnValue(false),
      getContainers: vi.fn().mockResolvedValue([]),
      getDocker: vi.fn().mockReturnValue(null),
    }

    ;(DockerClient as any).instance = mockDockerClient
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Singleton ──────────────────────────────────────────────────────────

  describe('singleton', () => {
    it('should create a singleton instance', () => {
      const engine1 = CleanupEngine.getInstance()
      const engine2 = CleanupEngine.getInstance()
      expect(engine1).toBe(engine2)
    })
  })

  // ── Initial state ──────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should return empty suggestions initially', () => {
      const engine = CleanupEngine.getInstance()
      expect(engine.getSuggestions()).toEqual([])
    })

    it('should return 0 total savings initially', () => {
      const engine = CleanupEngine.getInstance()
      expect(engine.getTotalSavings()).toBe(0)
    })
  })

  // ── analyze() — disconnected ──────────────────────────────────────────

  describe('analyze — disconnected', () => {
    it('should return empty suggestions when not connected', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(false)

      const suggestions = await engine.analyze()

      expect(suggestions).toEqual([])
      expect(engine.getSuggestions()).toEqual([])
    })
  })

  // ── analyze() — dangling images ───────────────────────────────────────

  describe('analyze — dangling images', () => {
    it('should identify dangling images (no RepoTags)', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([
          {
            Id: 'sha256:abc123def456',
            RepoTags: [],
            Size: 536870912, // 512 MB
          },
          {
            Id: 'sha256:tagged111',
            RepoTags: ['nginx:latest'],
            Size: 134217728,
          },
          {
            Id: 'sha256:another-tagged',
            RepoTags: ['myapp:v1.0'],
            Size: 268435456,
          },
        ]),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      const suggestions = await engine.analyze()

      expect(suggestions).toHaveLength(2) // 1 dangling + 1 build-cache
      const dangling = suggestions.find((s) => s.type === 'image')
      expect(dangling).toBeDefined()
      expect(dangling!.id).toBe('img-sha256:abc123def456')
      expect(dangling!.title).toBe('Dangling image: sha256:abc12')
      expect(dangling!.description).toBe(
        'This image is not tagged and not referenced by any container. Safe to remove.',
      )
      expect(dangling!.size).toBe(536870912)
      expect(dangling!.actionable).toBe(true)
      expect(dangling!.action).toBe('Remove dangling image')
      expect(dangling!.targetId).toBe('sha256:abc123def456')
    })

    it('should handle images with null RepoTags', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([
          {
            Id: 'sha256:null-tags',
            RepoTags: null,
            Size: 104857600,
          },
          {
            Id: 'sha256:tagged-ok',
            RepoTags: ['app:latest'],
            Size: 209715200,
          },
        ]),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      const suggestions = await engine.analyze()

      const dangling = suggestions.find((s) => s.type === 'image')
      expect(dangling).toBeDefined()
      expect(dangling!.targetId).toBe('sha256:null-tags')
    })

    it('should handle listImages throwing gracefully', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockRejectedValue(new Error('API error')),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      // Should not throw; the private method catches errors
      await expect(engine.analyze()).resolves.not.toThrow()
    })

    it('should handle empty image list', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([]),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      const suggestions = await engine.analyze()

      // Only build-cache suggestion
      expect(suggestions).toHaveLength(1)
      expect(suggestions[0].type).toBe('build-cache')
    })

    it('should handle images with zero size', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([
          {
            Id: 'sha256:zero-size',
            RepoTags: [],
            Size: 0,
          },
        ]),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      const suggestions = await engine.analyze()

      const dangling = suggestions.find((s) => s.type === 'image')
      expect(dangling).toBeDefined()
      expect(dangling!.size).toBe(0)
    })
  })

  // ── analyze() — stopped containers ────────────────────────────────────

  describe('analyze — stopped containers', () => {
    it('should identify exited containers', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'container-1',
          name: 'stopped-app',
          image: 'node:20',
          state: 'exited',
          status: 'Exited (0) 5 minutes ago',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
        {
          id: 'container-2',
          name: 'running-app',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 1 hour',
          cpuPercent: 5,
          memoryUsage: 10485760,
          memoryLimit: 1073741824,
          memoryPercent: 1,
          ports: [],
          created: 1700001000,
        },
      ])

      const suggestions = await engine.analyze()

      const containerSuggestion = suggestions.find(
        (s) => s.type === 'container',
      )
      expect(containerSuggestion).toBeDefined()
      expect(containerSuggestion!.id).toBe('container-container-1')
      expect(containerSuggestion!.title).toBe('Stopped container: stopped-app')
      expect(containerSuggestion!.description).toBe(
        'Container "stopped-app" is exited. Safe to remove to reclaim disk space.',
      )
      expect(containerSuggestion!.actionable).toBe(true)
      expect(containerSuggestion!.action).toBe('Remove stopped container')
      expect(containerSuggestion!.targetId).toBe('container-1')
    })

    it('should identify created containers', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'container-created',
          name: 'created-app',
          image: 'alpine:latest',
          state: 'created',
          status: 'Created 2 hours ago',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700002000,
        },
      ])

      const suggestions = await engine.analyze()

      const containerSuggestion = suggestions.find(
        (s) => s.type === 'container',
      )
      expect(containerSuggestion).toBeDefined()
      expect(containerSuggestion!.title).toBe('Stopped container: created-app')
      expect(containerSuggestion!.targetId).toBe('container-created')
    })

    it('should not include running containers', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'running-1',
          name: 'active-app',
          image: 'node:20',
          state: 'running',
          status: 'Up 30 minutes',
          cpuPercent: 10,
          memoryUsage: 52428800,
          memoryLimit: 2147483648,
          memoryPercent: 2.44,
          ports: [],
          created: 1700003000,
        },
      ])

      const suggestions = await engine.analyze()

      const containerSuggestion = suggestions.find(
        (s) => s.type === 'container',
      )
      expect(containerSuggestion).toBeUndefined()
    })

    it('should handle getContainers throwing gracefully', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      mockDockerClient.getContainers.mockRejectedValue(
        new Error('connection refused'),
      )

      await expect(engine.analyze()).resolves.not.toThrow()
    })

    it('should handle multiple stopped containers', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'c1',
          name: 'app1',
          image: 'node:20',
          state: 'exited',
          status: 'Exited (0) 1 hour ago',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
        {
          id: 'c2',
          name: 'app2',
          image: 'python:3',
          state: 'exited',
          status: 'Exited (1) 2 hours ago',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700001000,
        },
        {
          id: 'c3',
          name: 'app3',
          image: 'redis:7',
          state: 'running',
          status: 'Up 5 hours',
          cpuPercent: 2,
          memoryUsage: 10485760,
          memoryLimit: 1073741824,
          memoryPercent: 1,
          ports: [],
          created: 1700002000,
        },
      ])

      const suggestions = await engine.analyze()

      const containerSuggestions = suggestions.filter(
        (s) => s.type === 'container',
      )
      expect(containerSuggestions).toHaveLength(2)
      expect(containerSuggestions.map((s) => s.targetId)).toContain('c1')
      expect(containerSuggestions.map((s) => s.targetId)).toContain('c2')
    })
  })

  // ── analyze() — unused volumes ────────────────────────────────────────

  describe('analyze — unused volumes', () => {
    it('should identify unused volumes', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listVolumes: vi.fn().mockResolvedValue({
          Volumes: [
            { Name: 'unused-vol-1', Driver: 'local' },
            { Name: 'used-vol-1', Driver: 'local' },
            { Name: 'unused-vol-2', Driver: 'local' },
          ],
        }),
        listContainers: vi.fn().mockResolvedValue([
          {
            Id: 'container-used',
            Names: ['/app'],
            Image: 'node:20',
            State: 'running',
            Status: 'Up 1 hour',
            Ports: [],
            Created: 1700000000,
          },
        ]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({
            Mounts: [
              { Type: 'volume', Name: 'used-vol-1', Source: '/var/lib/docker/volumes/used-vol-1' },
              { Type: 'bind', Source: '/host/path', Destination: '/container/path' },
            ],
          }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      const suggestions = await engine.analyze()

      const volumeSuggestions = suggestions.filter((s) => s.type === 'volume')
      expect(volumeSuggestions).toHaveLength(2)
      expect(volumeSuggestions.map((s) => s.targetId)).toContain('unused-vol-1')
      expect(volumeSuggestions.map((s) => s.targetId)).toContain('unused-vol-2')
      expect(volumeSuggestions.map((s) => s.targetId)).not.toContain('used-vol-1')
    })

    it('should handle volumes with no name', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listVolumes: vi.fn().mockResolvedValue({
          Volumes: [
            { Name: undefined, Driver: 'local' },
            { Name: 'named-vol', Driver: 'local' },
          ],
        }),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      const suggestions = await engine.analyze()

      const volumeSuggestions = suggestions.filter((s) => s.type === 'volume')
      expect(volumeSuggestions).toHaveLength(1)
      expect(volumeSuggestions[0].targetId).toBe('named-vol')
    })

    it('should handle listVolumes throwing gracefully', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listVolumes: vi.fn().mockRejectedValue(new Error('API error')),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      await expect(engine.analyze()).resolves.not.toThrow()
    })

    it('should handle container inspect throwing gracefully', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listVolumes: vi.fn().mockResolvedValue({
          Volumes: [{ Name: 'vol-1', Driver: 'local' }],
        }),
        listContainers: vi.fn().mockResolvedValue([
          {
            Id: 'container-broken',
            Names: ['/app'],
            Image: 'node:20',
            State: 'running',
            Status: 'Up 1 hour',
            Ports: [],
            Created: 1700000000,
          },
        ]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockRejectedValue(new Error('no such container')),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      const suggestions = await engine.analyze()

      // vol-1 should be flagged as unused since container inspect failed
      const volumeSuggestions = suggestions.filter((s) => s.type === 'volume')
      expect(volumeSuggestions).toHaveLength(1)
      expect(volumeSuggestions[0].targetId).toBe('vol-1')
    })

    it('should handle empty volumes list', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listVolumes: vi.fn().mockResolvedValue({ Volumes: [] }),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      const suggestions = await engine.analyze()

      const volumeSuggestions = suggestions.filter((s) => s.type === 'volume')
      expect(volumeSuggestions).toHaveLength(0)
    })

    it('should handle volumes list being undefined', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listVolumes: vi.fn().mockResolvedValue({}),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      await expect(engine.analyze()).resolves.not.toThrow()
    })
  })

  // ── analyze() — build cache ───────────────────────────────────────────

  describe('analyze — build cache', () => {
    it('should always include build cache suggestion', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([]),
        listVolumes: vi.fn().mockResolvedValue({ Volumes: [] }),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)
      mockDockerClient.getContainers.mockResolvedValue([])

      const suggestions = await engine.analyze()

      const buildCache = suggestions.find((s) => s.type === 'build-cache')
      expect(buildCache).toBeDefined()
      expect(buildCache!.id).toBe('build-cache-prune')
      expect(buildCache!.title).toBe('Docker build cache')
      expect(buildCache!.description).toContain('docker builder prune')
      expect(buildCache!.actionable).toBe(true)
      expect(buildCache!.action).toBe('Run `docker builder prune`')
    })
  })

  // ── analyze() — full integration ──────────────────────────────────────

  describe('analyze — full integration', () => {
    it('should collect suggestions from all analyzers', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([
          { Id: 'img-dangling', RepoTags: [], Size: 104857600 },
          { Id: 'img-tagged', RepoTags: ['app:latest'], Size: 209715200 },
        ]),
        listVolumes: vi.fn().mockResolvedValue({
          Volumes: [{ Name: 'unused-vol', Driver: 'local' }],
        }),
        listContainers: vi.fn().mockResolvedValue([
          {
            Id: 'container-used',
            Names: ['/app'],
            Image: 'node:20',
            State: 'running',
            Status: 'Up 1 hour',
            Ports: [],
            Created: 1700000000,
          },
        ]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({
            Mounts: [{ Type: 'volume', Name: 'unused-vol' }],
          }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)

      mockDockerClient.getContainers.mockResolvedValue([
        {
          id: 'container-stopped',
          name: 'stopped-app',
          image: 'node:20',
          state: 'exited',
          status: 'Exited (0) 1 hour ago',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ])

      const suggestions = await engine.analyze()

      expect(suggestions).toHaveLength(3) // 1 image + 1 container + 1 build-cache (volume is used by container)
      const types = suggestions.map((s) => s.type)
      expect(types).toContain('image')
      expect(types).toContain('container')
      expect(types).not.toContain('volume')
      expect(types).toContain('build-cache')
    })

    it('should reset suggestions on each analyze call', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([
          { Id: 'img1', RepoTags: [], Size: 100 },
        ]),
        listVolumes: vi.fn().mockResolvedValue({ Volumes: [] }),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)
      mockDockerClient.getContainers.mockResolvedValue([])

      await engine.analyze()
      expect(engine.getSuggestions()).toHaveLength(2) // 1 image + 1 build-cache

      // Second call: no dangling images
      mockDocker.listImages.mockResolvedValue([])

      await engine.analyze()
      expect(engine.getSuggestions()).toHaveLength(1) // only build-cache
    })
  })

  // ── getSuggestions ────────────────────────────────────────────────────

  describe('getSuggestions', () => {
    it('should return the current suggestions list', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([]),
        listVolumes: vi.fn().mockResolvedValue({ Volumes: [] }),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)
      mockDockerClient.getContainers.mockResolvedValue([])

      await engine.analyze()

      const suggestions = engine.getSuggestions()
      expect(suggestions).toBeDefined()
      expect(Array.isArray(suggestions)).toBe(true)
    })

    it('should return a reference to the internal array', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([]),
        listVolumes: vi.fn().mockResolvedValue({ Volumes: [] }),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)
      mockDockerClient.getContainers.mockResolvedValue([])

      await engine.analyze()

      const suggestions1 = engine.getSuggestions()
      const suggestions2 = engine.getSuggestions()
      expect(suggestions1).toBe(suggestions2)
    })
  })

  // ── getTotalSavings ───────────────────────────────────────────────────

  describe('getTotalSavings', () => {
    it('should sum up all suggestion sizes', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([
          { Id: 'img1', RepoTags: [], Size: 104857600 }, // 100 MB
          { Id: 'img2', RepoTags: [], Size: 209715200 }, // 200 MB
        ]),
        listVolumes: vi.fn().mockResolvedValue({ Volumes: [] }),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)
      mockDockerClient.getContainers.mockResolvedValue([])

      await engine.analyze()

      expect(engine.getTotalSavings()).toBe(314572800) // 100 + 200 MB
    })

    it('should return 0 when no suggestions have size', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([]),
        listVolumes: vi.fn().mockResolvedValue({ Volumes: [] }),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)
      mockDockerClient.getContainers.mockResolvedValue([])

      await engine.analyze()

      // Only build-cache suggestion, which has size 0
      expect(engine.getTotalSavings()).toBe(0)
    })

    it('should handle zero size images', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([
          { Id: 'img1', RepoTags: [], Size: 0 },
        ]),
        listVolumes: vi.fn().mockResolvedValue({ Volumes: [] }),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)
      mockDockerClient.getContainers.mockResolvedValue([])

      await engine.analyze()

      expect(engine.getTotalSavings()).toBe(0)
    })
  })

  // ── clear ─────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('should remove all suggestions', async () => {
      const engine = CleanupEngine.getInstance()
      mockDockerClient.isConnected.mockReturnValue(true)

      const mockDocker = {
        listImages: vi.fn().mockResolvedValue([
          { Id: 'img1', RepoTags: [], Size: 100 },
        ]),
        listVolumes: vi.fn().mockResolvedValue({ Volumes: [] }),
        listContainers: vi.fn().mockResolvedValue([]),
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({ Mounts: [] }),
        }),
      }
      mockDockerClient.getDocker.mockReturnValue(mockDocker)
      mockDockerClient.getContainers.mockResolvedValue([])

      await engine.analyze()
      expect(engine.getSuggestions()).toHaveLength(2)

      engine.clear()
      expect(engine.getSuggestions()).toEqual([])
      expect(engine.getTotalSavings()).toBe(0)
    })

    it('should clear suggestions even when not analyzed', () => {
      const engine = CleanupEngine.getInstance()
      engine.clear()
      expect(engine.getSuggestions()).toEqual([])
    })
  })

  // ── CleanupSuggestion type values ─────────────────────────────────────

  describe('CleanupSuggestion type values', () => {
    it('should allow all four type values', () => {
      const types: CleanupSuggestion['type'][] = ['image', 'volume', 'build-cache', 'container']
      expect(types).toHaveLength(4)
      expect(types).toContain('image')
      expect(types).toContain('volume')
      expect(types).toContain('build-cache')
      expect(types).toContain('container')
    })
  })
})
