import { describe, it, expect, beforeEach } from 'vitest'
import { DockerClient } from '../docker/client'

describe('Docker Compose', () => {
  beforeEach(() => {
    DockerClient['instance'] = null
  })

  it('should throw when getting compose files without connection', async () => {
    const client = DockerClient.getInstance()
    await expect(client.getComposeFiles()).rejects.toThrow('Docker client not connected')
  })

  it('should throw when getting compose files with project name without connection', async () => {
    const client = DockerClient.getInstance()
    await expect(client.getComposeFiles('myproject')).rejects.toThrow(
      'Docker client not connected',
    )
  })
})
