import Dockerode from 'dockerode'

export interface ContainerInfo {
  id: string
  name: string
  image: string
  state: string
  status: string
  cpuPercent: number
  memoryUsage: number
  memoryLimit: number
  memoryPercent: number
  ports: Array<{ ip: string; privatePort: number; publicPort: number; type: string }>
  created: number
}

export interface ContainerStats {
  cpuPercent: number
  memoryUsage: number
  memoryLimit: number
  memoryPercent: number
}

export class DockerClient {
  private static instance: DockerClient | null = null
  private docker: Dockerode | null = null
  private connected: boolean = false

  private constructor() {}

  static getInstance(): DockerClient {
    if (!DockerClient.instance) {
      DockerClient.instance = new DockerClient()
    }
    return DockerClient.instance
  }

  async connect(): Promise<void> {
    try {
      this.docker = new Dockerode()
      await this.docker.ping()
      this.connected = true
    } catch (error) {
      this.connected = false
      throw new Error(`Docker connection failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  getDocker(): Dockerode | null {
    return this.docker
  }

  async getContainers(): Promise<ContainerInfo[]> {
    if (!this.docker) {
      throw new Error('Docker client not connected')
    }

    const containers = await this.docker.listContainers({ all: true })
    const result: ContainerInfo[] = []

    for (const container of containers) {
      const info: ContainerInfo = {
        id: container.Id,
        name: container.Names[0]?.replace('/', '') || container.Id.slice(0, 12),
        image: container.Image,
        state: container.State || 'unknown',
        status: container.Status || '',
        cpuPercent: 0,
        memoryUsage: 0,
        memoryLimit: 0,
        memoryPercent: 0,
        ports: (container.Ports || []).map((p) => ({
          ip: p.IP || '',
          privatePort: p.PrivatePort,
          publicPort: p.PublicPort || 0,
          type: p.Type || '',
        })),
        created: container.Created,
      }
      result.push(info)
    }

    return result
  }

  async getContainerStats(containerId: string): Promise<ContainerStats | null> {
    if (!this.docker) {
      throw new Error('Docker client not connected')
    }

    const container = this.docker.getContainer(containerId)
    const stream = await container.stats({ stream: false })

    if (!stream) {
      return null
    }

    const memoryUsage = stream.memory_stats?.usage || 0
    const memoryLimit = stream.memory_stats?.limit || 1
    const cpuDelta = stream.cpu_stats?.cpu_usage?.total_usage || 0
    const prevCpuDelta = stream.precpu_stats?.cpu_usage?.total_usage || 0
    const cpuSystemDelta = stream.cpu_stats?.system_cpu_usage || 0
    const prevCpuSystem = stream.precpu_stats?.system_cpu_usage || 0

    let cpuPercent = 0
    if (cpuSystemDelta > 0 && prevCpuSystem > 0 && cpuDelta > 0 && prevCpuDelta > 0) {
      const totalCpuUsage = cpuDelta - prevCpuDelta
      const totalSystemCpu = cpuSystemDelta - prevCpuSystem
      const numCpus = stream.cpu_stats?.online_cpus || 1
      cpuPercent = (totalCpuUsage / totalSystemCpu) * numCpus * 100.0
    }

    return {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsage,
      memoryLimit,
      memoryPercent: Math.round((memoryUsage / memoryLimit) * 100 * 100) / 100,
    }
  }

  async restartContainer(containerId: string): Promise<void> {
    if (!this.docker) {
      throw new Error('Docker client not connected')
    }

    const container = this.docker.getContainer(containerId)
    await container.restart()
  }

  async stopContainer(containerId: string): Promise<void> {
    if (!this.docker) {
      throw new Error('Docker client not connected')
    }

    const container = this.docker.getContainer(containerId)
    await container.stop()
  }

  async startContainer(containerId: string): Promise<void> {
    if (!this.docker) {
      throw new Error('Docker client not connected')
    }

    const container = this.docker.getContainer(containerId)
    await container.start()
  }

  async removeContainer(containerId: string, force = false): Promise<void> {
    if (!this.docker) {
      throw new Error('Docker client not connected')
    }

    const container = this.docker.getContainer(containerId)
    await container.remove({ force })
  }

  async getContainerLogs(
    containerId: string,
    options: { tail?: number; since?: number; timestamps?: boolean; follow?: boolean } = {},
  ): Promise<string[]> {
    if (!this.docker) {
      throw new Error('Docker client not connected')
    }

    const container = this.docker.getContainer(containerId)
    const logsOptions: Record<string, unknown> = {
      stdout: true,
      stderr: true,
      tail: options.tail ?? 100,
    }
    if (options.timestamps !== undefined) logsOptions.timestamps = options.timestamps
    if (options.follow !== undefined) logsOptions.follow = options.follow
    if (options.since !== undefined) logsOptions.since = options.since

    const logs = await container.logs(logsOptions)

    // Dockerode returns a NodeJS.ReadableStream; we need to consume it
    return new Promise<string[]>((resolve, reject) => {
      const chunks: Buffer[] = []
      logs.on('data', (chunk: Buffer) => chunks.push(chunk))
      logs.on('end', () => {
        const content = Buffer.concat(chunks).toString('utf-8')
        const lines = content
          .split('\n')
          .filter((line) => line.trim().length > 0)
        resolve(lines)
      })
      logs.on('error', reject)
    })
  }

  async getComposeFiles(projectName?: string): Promise<string[]> {
    if (!this.docker) {
      throw new Error('Docker client not connected')
    }

    // List volumes to find compose projects
    const volumes = await this.docker.listVolumes()
    const composeFiles: string[] = []

    for (const volume of volumes.Volumes || []) {
      if (volume.Name?.includes('_') && volume.Mountpoint) {
        // Heuristic: check if mountpoint contains docker-compose files
        // This is a simplified check; a real implementation would scan directories
      }
    }

    return composeFiles
  }

  async getDiskUsage(): Promise<{
    images: { totalSize: number; count: number }
    volumes: { totalSize: number; count: number }
    buildCache: { totalSize: number }
    containers: { totalSize: number; count: number }
  }> {
    if (!this.docker) {
      throw new Error('Docker client not connected')
    }

    const images = await this.docker.listImages({ all: true })
    let totalImageSize = 0
    for (const img of images) {
      totalImageSize += img.Size || 0
    }

    const volumes = await this.docker.listVolumes()
    let volumeCount = 0
    let volumeSize = 0
    for (const vol of volumes.Volumes || []) {
      volumeCount++
      // Volume size requires filesystem access, approximate here
      volumeSize += 0 // Would need to stat the mountpoint
    }

    const containers = await this.docker.listContainers({ all: true })
    let containerSize = 0
    let containerCount = 0
    for (const c of containers) {
      if (c.State === 'exited' || c.State === 'created') {
        containerCount++
        try {
          const container = this.docker!.getContainer(c.Id)
          const inspect = await container.inspect()
          containerSize += inspect.SizeRw || 0
        } catch {
          // Container may have been removed
        }
      }
    }

    return {
      images: { totalSize: totalImageSize, count: images.length },
      volumes: { totalSize: volumeSize, count: volumeCount },
      buildCache: { totalSize: 0 }, // Requires buildkit inspection
      containers: { totalSize: containerSize, count: containerCount },
    }
  }
}
