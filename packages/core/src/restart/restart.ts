import { DockerClient, ContainerInfo } from '../docker/client'

export type ContainerLifecycleStatus =
  | 'running'
  | 'stopped'
  | 'paused'
  | 'restarting'
  | 'removing'
  | 'exited'
  | 'created'
  | 'dead'
  | 'unknown'

export interface ContainerLifecycle {
  containerId: string
  containerName: string
  status: ContainerLifecycleStatus
  lastAction: string
  lastActionTime: number
  error?: string
}

export type LifecycleCallback = (lifecycle: ContainerLifecycle) => void

export class RestartHandler {
  private static instance: RestartHandler | null = null
  private dockerClient: DockerClient
  private lifecycleMap: Map<string, ContainerLifecycle>
  private listeners: Set<LifecycleCallback>

  private constructor() {
    this.dockerClient = DockerClient.getInstance()
    this.lifecycleMap = new Map()
    this.listeners = new Set()
  }

  static getInstance(): RestartHandler {
    if (!RestartHandler.instance) {
      RestartHandler.instance = new RestartHandler()
    }
    return RestartHandler.instance
  }

  /**
   * Subscribe to lifecycle status updates for a container.
   * Returns an unsubscribe function.
   */
  subscribe(listener: LifecycleCallback): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(lifecycle: ContainerLifecycle): void {
    for (const listener of this.listeners) {
      try {
        listener(lifecycle)
      } catch {
        // Listener errors should not break the handler
      }
    }
  }

  /**
   * Map Docker container state strings to our lifecycle status.
   */
  mapState(state: string): ContainerLifecycleStatus {
    switch (state.toLowerCase()) {
      case 'running':
        return 'running'
      case 'exited':
      case 'dead':
        return state.toLowerCase() as ContainerLifecycleStatus
      case 'paused':
        return 'paused'
      case 'restarting':
        return 'restarting'
      case 'removing':
        return 'removing'
      case 'created':
        return 'created'
      default:
        return 'unknown'
    }
  }

  /**
   * Refresh lifecycle status for a container from Docker (silent, no notify).
   */
  private async refreshStatusSilent(containerId: string): Promise<ContainerLifecycle> {
    if (!this.dockerClient.isConnected()) {
      throw new Error('Docker client not connected')
    }

    const containers = await this.dockerClient.getContainers()
    const container = containers.find((c) => c.id === containerId)

    if (!container) {
      throw new Error(`Container ${containerId} not found`)
    }

    return {
      containerId: container.id,
      containerName: container.name,
      status: this.mapState(container.state),
      lastAction: 'refresh',
      lastActionTime: Date.now(),
    }
  }

  /**
   * Refresh lifecycle status for a container from Docker (with notify).
   */
  private async refreshStatus(containerId: string): Promise<ContainerLifecycle> {
    const lifecycle = await this.refreshStatusSilent(containerId)
    this.lifecycleMap.set(containerId, lifecycle)
    this.notify(lifecycle)
    return lifecycle
  }

  /**
   * Restart a container with lifecycle status tracking.
   * Returns the lifecycle status after the restart attempt.
   */
  async restartContainer(containerId: string): Promise<ContainerLifecycle> {
    if (!this.dockerClient.isConnected()) {
      throw new Error('Docker client not connected')
    }

    // Set status to restarting
    const restartingLifecycle: ContainerLifecycle = {
      containerId,
      containerName: this.getContainerName(containerId) || containerId.slice(0, 12),
      status: 'restarting',
      lastAction: 'restart',
      lastActionTime: Date.now(),
    }
    this.lifecycleMap.set(containerId, restartingLifecycle)
    this.notify(restartingLifecycle)

    try {
      await this.dockerClient.restartContainer(containerId)
      // Refresh to get the actual post-restart status
      return this.refreshStatus(containerId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Try to get actual status from Docker
      let actualStatus: ContainerLifecycleStatus | undefined
      try {
        actualStatus = (await this.refreshStatusSilent(containerId)).status
      } catch {
        actualStatus = this.lifecycleMap.get(containerId)?.status
      }

      const failedLifecycle: ContainerLifecycle = {
        containerId,
        containerName: this.getContainerName(containerId) || containerId.slice(0, 12),
        status: actualStatus || 'unknown',
        lastAction: 'restart',
        lastActionTime: Date.now(),
        error: errorMessage,
      }
      this.lifecycleMap.set(containerId, failedLifecycle)
      this.notify(failedLifecycle)
      throw new Error(`Failed to restart container ${containerId}: ${errorMessage}`)
    }
  }

  /**
   * Stop a container with lifecycle status tracking.
   */
  async stopContainer(containerId: string): Promise<ContainerLifecycle> {
    if (!this.dockerClient.isConnected()) {
      throw new Error('Docker client not connected')
    }

    const stoppedLifecycle: ContainerLifecycle = {
      containerId,
      containerName: this.getContainerName(containerId) || containerId.slice(0, 12),
      status: 'stopped',
      lastAction: 'stop',
      lastActionTime: Date.now(),
    }
    this.lifecycleMap.set(containerId, stoppedLifecycle)
    this.notify(stoppedLifecycle)

    try {
      await this.dockerClient.stopContainer(containerId)
      return this.refreshStatus(containerId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      let actualStatus: ContainerLifecycleStatus | undefined
      try {
        actualStatus = (await this.refreshStatusSilent(containerId)).status
      } catch {
        actualStatus = this.lifecycleMap.get(containerId)?.status
      }

      const failedLifecycle: ContainerLifecycle = {
        containerId,
        containerName: this.getContainerName(containerId) || containerId.slice(0, 12),
        status: actualStatus || 'unknown',
        lastAction: 'stop',
        lastActionTime: Date.now(),
        error: errorMessage,
      }
      this.lifecycleMap.set(containerId, failedLifecycle)
      this.notify(failedLifecycle)
      throw new Error(`Failed to stop container ${containerId}: ${errorMessage}`)
    }
  }

  /**
   * Start a container with lifecycle status tracking.
   */
  async startContainer(containerId: string): Promise<ContainerLifecycle> {
    if (!this.dockerClient.isConnected()) {
      throw new Error('Docker client not connected')
    }

    const startedLifecycle: ContainerLifecycle = {
      containerId,
      containerName: this.getContainerName(containerId) || containerId.slice(0, 12),
      status: 'running',
      lastAction: 'start',
      lastActionTime: Date.now(),
    }
    this.lifecycleMap.set(containerId, startedLifecycle)
    this.notify(startedLifecycle)

    try {
      await this.dockerClient.startContainer(containerId)
      return this.refreshStatus(containerId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      let actualStatus: ContainerLifecycleStatus | undefined
      try {
        actualStatus = (await this.refreshStatusSilent(containerId)).status
      } catch {
        actualStatus = this.lifecycleMap.get(containerId)?.status
      }

      const failedLifecycle: ContainerLifecycle = {
        containerId,
        containerName: this.getContainerName(containerId) || containerId.slice(0, 12),
        status: actualStatus || 'unknown',
        lastAction: 'start',
        lastActionTime: Date.now(),
        error: errorMessage,
      }
      this.lifecycleMap.set(containerId, failedLifecycle)
      this.notify(failedLifecycle)
      throw new Error(`Failed to start container ${containerId}: ${errorMessage}`)
    }
  }

  /**
   * Remove a container with lifecycle status tracking.
   */
  async removeContainer(containerId: string, force = false): Promise<ContainerLifecycle> {
    if (!this.dockerClient.isConnected()) {
      throw new Error('Docker client not connected')
    }

    const removingLifecycle: ContainerLifecycle = {
      containerId,
      containerName: this.getContainerName(containerId) || containerId.slice(0, 12),
      status: 'removing',
      lastAction: force ? 'force-remove' : 'remove',
      lastActionTime: Date.now(),
    }
    this.lifecycleMap.set(containerId, removingLifecycle)
    this.notify(removingLifecycle)

    try {
      await this.dockerClient.removeContainer(containerId, force)
      // After removal, the container no longer exists
      const removedLifecycle: ContainerLifecycle = {
        containerId,
        containerName: this.getContainerName(containerId) || containerId.slice(0, 12),
        status: 'dead',
        lastAction: force ? 'force-remove' : 'remove',
        lastActionTime: Date.now(),
      }
      this.lifecycleMap.set(containerId, removedLifecycle)
      this.notify(removedLifecycle)
      return removedLifecycle
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      let actualStatus: ContainerLifecycleStatus | undefined
      try {
        actualStatus = (await this.refreshStatusSilent(containerId)).status
      } catch {
        actualStatus = this.lifecycleMap.get(containerId)?.status
      }

      const failedLifecycle: ContainerLifecycle = {
        containerId,
        containerName: this.getContainerName(containerId) || containerId.slice(0, 12),
        status: actualStatus || 'unknown',
        lastAction: force ? 'force-remove' : 'remove',
        lastActionTime: Date.now(),
        error: errorMessage,
      }
      this.lifecycleMap.set(containerId, failedLifecycle)
      this.notify(failedLifecycle)
      throw new Error(`Failed to remove container ${containerId}: ${errorMessage}`)
    }
  }

  /**
   * Get the current lifecycle status for a container.
   */
  getLifecycle(containerId: string): ContainerLifecycle | undefined {
    return this.lifecycleMap.get(containerId)
  }

  /**
   * Get the container name from the lifecycle map or try to fetch from Docker.
   */
  private getContainerName(containerId: string): string | undefined {
    const lifecycle = this.lifecycleMap.get(containerId)
    if (lifecycle) {
      return lifecycle.containerName
    }
    return undefined
  }

  /**
   * Get all tracked container lifecycles.
   */
  getAllLifecycles(): ContainerLifecycle[] {
    return Array.from(this.lifecycleMap.values())
  }

  /**
   * Get lifecycle statuses for all currently running containers.
   */
  async refreshAllContainers(): Promise<ContainerLifecycle[]> {
    if (!this.dockerClient.isConnected()) {
      throw new Error('Docker client not connected')
    }

    const containers = await this.dockerClient.getContainers()
    const results: ContainerLifecycle[] = []

    for (const container of containers) {
      const lifecycle: ContainerLifecycle = {
        containerId: container.id,
        containerName: container.name,
        status: this.mapState(container.state),
        lastAction: 'refresh',
        lastActionTime: Date.now(),
      }
      this.lifecycleMap.set(container.id, lifecycle)
      results.push(lifecycle)
    }

    // Notify all listeners
    for (const lifecycle of results) {
      this.notify(lifecycle)
    }

    return results
  }

  /**
   * Clear all lifecycle data.
   */
  clear(): void {
    this.lifecycleMap.clear()
  }

  /**
   * Get the count of tracked containers.
   */
  getTrackedCount(): number {
    return this.lifecycleMap.size
  }
}
