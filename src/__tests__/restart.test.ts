import { describe, it, expect, beforeEach } from 'vitest'
import { DockerClient } from '../docker/client'

describe('Container Restart', () => {
  beforeEach(() => {
    DockerClient['instance'] = null
  })

  it('should throw when restarting without connection', async () => {
    const client = DockerClient.getInstance()
    await expect(client.restartContainer('test-container')).rejects.toThrow(
      'Docker client not connected',
    )
  })

  it('should throw when stopping without connection', async () => {
    const client = DockerClient.getInstance()
    await expect(client.stopContainer('test-container')).rejects.toThrow(
      'Docker client not connected',
    )
  })

  it('should throw when starting without connection', async () => {
    const client = DockerClient.getInstance()
    await expect(client.startContainer('test-container')).rejects.toThrow(
      'Docker client not connected',
    )
  })

  it('should throw when removing without connection', async () => {
    const client = DockerClient.getInstance()
    await expect(client.removeContainer('test-container')).rejects.toThrow(
      'Docker client not connected',
    )
  })

  it('should throw when removing with force without connection', async () => {
    const client = DockerClient.getInstance()
    await expect(client.removeContainer('test-container', true)).rejects.toThrow(
      'Docker client not connected',
    )
  })
})
