import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DockerClient, ContainerInfo, ContainerStats } from '../docker/client'

// Mock Dockerode
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

describe('DockerClient', () => {
  let client: DockerClient

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton
    ;(DockerClient as any).instance = null
    client = DockerClient.getInstance()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create a singleton instance', () => {
    const client1 = DockerClient.getInstance()
    const client2 = DockerClient.getInstance()
    expect(client1).toBe(client2)
  })

  it('should not be connected initially', () => {
    expect(client.isConnected()).toBe(false)
  })

  it('should return null docker instance before connecting', () => {
    expect(client.getDocker()).toBeNull()
  })

  describe('connect', () => {
    it('should connect successfully when Docker daemon responds', async () => {
      mockPing.mockResolvedValue(undefined)

      await client.connect()

      expect(client.isConnected()).toBe(true)
      expect(client.getDocker()).not.toBeNull()
    })

    it('should throw when Docker daemon is not available', async () => {
      mockPing.mockRejectedValue(new Error('connect ECONNREFUSED'))

      await expect(client.connect()).rejects.toThrow('Docker connection failed')
      expect(client.isConnected()).toBe(false)
    })
  })

  describe('getContainers — docker ps equivalent', () => {
    it('should throw when not connected', async () => {
      await expect(client.getContainers()).rejects.toThrow('Docker client not connected')
    })

    it('should return a list of containers with docker ps equivalent fields', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockContainers = [
        {
          Id: 'abc123def456',
          Names: ['/nginx-web'],
          Image: 'nginx:latest',
          State: 'running',
          Status: 'Up 2 hours',
          Ports: [{ IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }],
          Created: 1700000000,
        },
        {
          Id: '789xyz000111',
          Names: ['/redis-cache'],
          Image: 'redis:7-alpine',
          State: 'running',
          Status: 'Up 5 hours',
          Ports: [],
          Created: 1699990000,
        },
        {
          Id: 'fff000aaa111',
          Names: ['/postgres-db'],
          Image: 'postgres:16',
          State: 'exited',
          Status: 'Exited (0) 1 day ago',
          Ports: [],
          Created: 1699900000,
        },
      ]

      mockListContainers.mockResolvedValue(mockContainers)

      const containers = await client.getContainers()

      expect(containers).toHaveLength(3)
      expect(containers[0]).toMatchObject({
        id: 'abc123def456',
        name: 'nginx-web',
        image: 'nginx:latest',
        state: 'running',
        status: 'Up 2 hours',
        cpuPercent: 0,
        memoryUsage: 0,
        memoryLimit: 0,
        memoryPercent: 0,
        ports: [{ ip: '0.0.0.0', privatePort: 80, publicPort: 8080, type: 'tcp' }],
        created: 1700000000,
      })
      expect(containers[1].name).toBe('redis-cache')
      expect(containers[2].state).toBe('exited')
      expect(mockListContainers).toHaveBeenCalledWith({ all: true })
    })

    it('should handle containers with no name gracefully', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockContainers = [
        {
          Id: 'no-name-id',
          Names: [],
          Image: 'alpine:latest',
          State: 'running',
          Status: 'Up 10 minutes',
          Ports: [],
          Created: 1700001000,
        },
      ]

      mockListContainers.mockResolvedValue(mockContainers)

      const containers = await client.getContainers()

      expect(containers).toHaveLength(1)
      // Should fall back to short ID
      expect(containers[0].name).toBe('no-name-id')
    })

    it('should handle containers with no ports gracefully', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockContainers = [
        {
          Id: 'no-ports-id',
          Names: ['/app'],
          Image: 'node:20',
          State: 'running',
          Status: 'Up 30 minutes',
          Ports: undefined,
          Created: 1700002000,
        },
      ]

      mockListContainers.mockResolvedValue(mockContainers)

      const containers = await client.getContainers()

      expect(containers).toHaveLength(1)
      expect(containers[0].ports).toEqual([])
    })
  })

  describe('getContainerStats', () => {
    it('should throw when not connected', async () => {
      await expect(client.getContainerStats('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })

    it('should return CPU and memory stats from container', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockStats = {
        cpu_stats: {
          cpu_usage: { total_usage: 500000000 },
          system_cpu_usage: 1000000000,
          online_cpus: 4,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 200000000 },
          system_cpu_usage: 800000000,
        },
        memory_stats: {
          usage: 52428800, // 50 MB
          limit: 2147483648, // 2 GB
        },
      }

      const mockContainer = {
        stats: vi.fn().mockResolvedValue(mockStats),
      }
      mockGetContainer.mockReturnValue(mockContainer)

      const stats = await client.getContainerStats('test-container')

      expect(stats).not.toBeNull()
      expect(stats!.cpuPercent).toBe(600) // (300M / 200M) * 4 * 100 = 600
      // cpuDelta = 500M - 200M = 300M
      // cpuSystemDelta = 1000M - 800M = 200M
      expect(stats!.memoryUsage).toBe(52428800)
      expect(stats!.memoryLimit).toBe(2147483648)
      expect(stats!.memoryPercent).toBeCloseTo(2.44, 1) // 50MB / 2GB * 100 = 2.44%
      expect(mockGetContainer).toHaveBeenCalledWith('test-container')
    })

    it('should return null when stats is null', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockContainer = {
        stats: vi.fn().mockResolvedValue(null),
      }
      mockGetContainer.mockReturnValue(mockContainer)

      const stats = await client.getContainerStats('test-container')

      expect(stats).toBeNull()
    })

    it('should handle zero CPU values gracefully', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockStats = {
        cpu_stats: {
          cpu_usage: { total_usage: 0 },
          system_cpu_usage: 0,
          online_cpus: 2,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 0 },
          system_cpu_usage: 0,
        },
        memory_stats: {
          usage: 0,
          limit: 1073741824,
        },
      }

      const mockContainer = {
        stats: vi.fn().mockResolvedValue(mockStats),
      }
      mockGetContainer.mockReturnValue(mockContainer)

      const stats = await client.getContainerStats('test-container')

      expect(stats).not.toBeNull()
      expect(stats!.cpuPercent).toBe(0)
    })
  })

  describe('restartContainer', () => {
    it('should throw when not connected', async () => {
      await expect(client.restartContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })

    it('should restart a container', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockContainer = {
        restart: vi.fn().mockResolvedValue(undefined),
      }
      mockGetContainer.mockReturnValue(mockContainer)

      await client.restartContainer('test-container')

      expect(mockGetContainer).toHaveBeenCalledWith('test-container')
      expect(mockContainer.restart).toHaveBeenCalled()
    })
  })

  describe('stopContainer', () => {
    it('should throw when not connected', async () => {
      await expect(client.stopContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })

    it('should stop a container', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockContainer = {
        stop: vi.fn().mockResolvedValue(undefined),
      }
      mockGetContainer.mockReturnValue(mockContainer)

      await client.stopContainer('test-container')

      expect(mockGetContainer).toHaveBeenCalledWith('test-container')
      expect(mockContainer.stop).toHaveBeenCalled()
    })
  })

  describe('startContainer', () => {
    it('should throw when not connected', async () => {
      await expect(client.startContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })

    it('should start a container', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockContainer = {
        start: vi.fn().mockResolvedValue(undefined),
      }
      mockGetContainer.mockReturnValue(mockContainer)

      await client.startContainer('test-container')

      expect(mockGetContainer).toHaveBeenCalledWith('test-container')
      expect(mockContainer.start).toHaveBeenCalled()
    })
  })

  describe('removeContainer', () => {
    it('should throw when not connected', async () => {
      await expect(client.removeContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })

    it('should remove a container without force', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockContainer = {
        remove: vi.fn().mockResolvedValue(undefined),
      }
      mockGetContainer.mockReturnValue(mockContainer)

      await client.removeContainer('test-container')

      expect(mockGetContainer).toHaveBeenCalledWith('test-container')
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: false })
    })

    it('should remove a container with force', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockContainer = {
        remove: vi.fn().mockResolvedValue(undefined),
      }
      mockGetContainer.mockReturnValue(mockContainer)

      await client.removeContainer('test-container', true)

      expect(mockGetContainer).toHaveBeenCalledWith('test-container')
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true })
    })
  })

  describe('getContainerLogs', () => {
    it('should throw when not connected', async () => {
      await expect(client.getContainerLogs('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })

    it('should return log lines from a container', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockStream = {
        on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
          if (event === 'data') {
            cb(Buffer.from('INFO Starting application\nERROR Connection failed\n'))
          }
          if (event === 'end') {
            cb(Buffer.from(''))
          }
          if (event === 'error') {
            // no error
          }
        }),
      }

      const mockContainer = {
        logs: vi.fn().mockResolvedValue(mockStream),
      }
      mockGetContainer.mockReturnValue(mockContainer)

      const logs = await client.getContainerLogs('test-container')

      expect(mockGetContainer).toHaveBeenCalledWith('test-container')
      expect(logs).toEqual(['INFO Starting application', 'ERROR Connection failed'])
    })

    it('should filter out empty lines from logs', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockStream = {
        on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
          if (event === 'data') {
            cb(Buffer.from('line1\n\nline2\n\n\n'))
          }
          if (event === 'end') {
            cb(Buffer.from(''))
          }
        }),
      }

      const mockContainer = {
        logs: vi.fn().mockResolvedValue(mockStream),
      }
      mockGetContainer.mockReturnValue(mockContainer)

      const logs = await client.getContainerLogs('test-container')

      expect(logs).toEqual(['line1', 'line2'])
    })

    it('should pass tail and timestamps options to Docker', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      const mockStream = {
        on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
          if (event === 'data') {
            cb(Buffer.from('log line\n'))
          }
          if (event === 'end') {
            cb(Buffer.from(''))
          }
        }),
      }

      const mockContainer = {
        logs: vi.fn().mockResolvedValue(mockStream),
      }
      mockGetContainer.mockReturnValue(mockContainer)

      await client.getContainerLogs('test-container', { tail: 50, timestamps: true })

      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        tail: 50,
        timestamps: true,
      })
    })
  })

  describe('getComposeFiles', () => {
    it('should throw when not connected', async () => {
      await expect(client.getComposeFiles()).rejects.toThrow('Docker client not connected')
    })

    it('should return an empty array when no compose volumes found', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      mockListVolumes.mockResolvedValue({ Volumes: [] })

      const files = await client.getComposeFiles()

      expect(files).toEqual([])
    })
  })

  describe('getDiskUsage', () => {
    it('should throw when not connected', async () => {
      await expect(client.getDiskUsage()).rejects.toThrow('Docker client not connected')
    })

    it('should return disk usage summary', async () => {
      mockPing.mockResolvedValue(undefined)
      await client.connect()

      mockListImages.mockResolvedValue([
        { Id: 'img1', Size: 1073741824 }, // 1 GB
        { Id: 'img2', Size: 536870912 }, // 512 MB
      ])

      mockListVolumes.mockResolvedValue({
        Volumes: [
          { Name: 'my-volume', Mountpoint: '/var/lib/docker/volumes/my-volume' },
        ],
      })

      mockListContainers.mockResolvedValue([
        {
          Id: 'running-1',
          State: 'running',
          Status: 'Up 1 hour',
        },
        {
          Id: 'exited-1',
          State: 'exited',
          Status: 'Exited (0) 2 hours ago',
        },
      ])

      const mockExitedContainer = {
        inspect: vi.fn().mockResolvedValue({ SizeRw: 1048576 }), // 1 MB
      }
      mockGetContainer.mockReturnValue(mockExitedContainer)

      const usage = await client.getDiskUsage()

      expect(usage.images.totalSize).toBe(1610612736) // 1GB + 512MB
      expect(usage.images.count).toBe(2)
      expect(usage.volumes.count).toBe(1)
      expect(usage.containers.count).toBe(1) // only exited/created
      expect(usage.containers.totalSize).toBe(1048576)
    })
  })
})
