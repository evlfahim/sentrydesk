import { DockerClient } from '../docker/client'

export interface CleanupSuggestion {
  id: string
  type: 'image' | 'volume' | 'build-cache' | 'container'
  title: string
  description: string
  size: number
  actionable: boolean
  action: string
  targetId?: string
}

export class CleanupEngine {
  private static instance: CleanupEngine | null = null
  private dockerClient: DockerClient
  private suggestions: CleanupSuggestion[] = []

  private constructor() {
    this.dockerClient = DockerClient.getInstance()
  }

  static getInstance(): CleanupEngine {
    if (!CleanupEngine.instance) {
      CleanupEngine.instance = new CleanupEngine()
    }
    return CleanupEngine.instance
  }

  async analyze(): Promise<CleanupSuggestion[]> {
    this.suggestions = []

    if (!this.dockerClient.isConnected()) {
      return this.suggestions
    }

    // Analyze dangling images
    await this.analyzeDanglingImages()

    // Analyze stopped containers
    await this.analyzeStoppedContainers()

    // Analyze unused volumes
    await this.analyzeUnusedVolumes()

    // Analyze build cache
    await this.analyzeBuildCache()

    return this.suggestions
  }

  private async analyzeDanglingImages(): Promise<void> {
    if (!this.dockerClient.isConnected()) return

    try {
      const images = await this.dockerClient.getDocker()!.listImages({ all: true })
      for (const img of images) {
        // Dangling images have no tags (RepoTags is empty, null, or undefined)
        if (!img.RepoTags || img.RepoTags.length === 0) {
          this.suggestions.push({
            id: `img-${img.Id}`,
            type: 'image',
            title: `Dangling image: ${img.Id.slice(0, 12)}`,
            description: 'This image is not tagged and not referenced by any container. Safe to remove.',
            size: img.Size || 0,
            actionable: true,
            action: 'Remove dangling image',
            targetId: img.Id,
          })
        }
      }
    } catch {
      // Docker API may not be available in tests
    }
  }

  private async analyzeStoppedContainers(): Promise<void> {
    if (!this.dockerClient.isConnected()) return

    try {
      const containers = await this.dockerClient.getContainers()
      for (const container of containers) {
        if (container.state === 'exited' || container.state === 'created') {
          this.suggestions.push({
            id: `container-${container.id}`,
            type: 'container',
            title: `Stopped container: ${container.name}`,
            description: `Container "${container.name}" is ${container.state}. Safe to remove to reclaim disk space.`,
            size: 0,
            actionable: true,
            action: 'Remove stopped container',
            targetId: container.id,
          })
        }
      }
    } catch {
      // Docker API may not be available in tests
    }
  }

  private async analyzeUnusedVolumes(): Promise<void> {
    if (!this.dockerClient.isConnected()) return

    try {
      const volumes = await this.dockerClient.getDocker()!.listVolumes()
      // Get all container IDs
      const containers = await this.dockerClient.getDocker()!.listContainers({ all: true })
      const usedVolumeNames = new Set<string>()

      for (const container of containers) {
        try {
          const containerObj = this.dockerClient.getDocker()!.getContainer(container.Id)
          const inspect = await containerObj.inspect()
          if (inspect.Mounts) {
            for (const mount of inspect.Mounts) {
              if (mount.Type === 'volume' && mount.Name) {
                usedVolumeNames.add(mount.Name)
              }
            }
          }
        } catch {
          // Container may have been removed
        }
      }

      for (const vol of volumes.Volumes || []) {
        if (vol.Name && !usedVolumeNames.has(vol.Name)) {
          this.suggestions.push({
            id: `vol-${vol.Name}`,
            type: 'volume',
            title: `Unused volume: ${vol.Name}`,
            description: `Volume "${vol.Name}" is not mounted by any container. Safe to remove.`,
            size: 0,
            actionable: true,
            action: 'Remove unused volume',
            targetId: vol.Name,
          })
        }
      }
    } catch {
      // Docker API may not be available in tests
    }
  }

  private async analyzeBuildCache(): Promise<void> {
    // Build cache analysis requires buildkit or docker buildx
    // For now, we provide a generic suggestion
    this.suggestions.push({
      id: 'build-cache-prune',
      type: 'build-cache',
      title: 'Docker build cache',
      description:
        'Docker build cache can accumulate over time. Run `docker builder prune` to clear it.',
      size: 0,
      actionable: true,
      action: 'Run `docker builder prune`',
    })
  }

  getSuggestions(): CleanupSuggestion[] {
    return this.suggestions
  }

  getTotalSavings(): number {
    return this.suggestions.reduce((sum, s) => sum + s.size, 0)
  }

  clear(): void {
    this.suggestions = []
  }
}
