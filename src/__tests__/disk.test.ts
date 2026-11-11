import { describe, it, expect, beforeEach } from 'vitest'
import { DockerClient } from '../docker/client'

describe('Disk Space', () => {
  beforeEach(() => {
    DockerClient['instance'] = null
  })

  it('should throw when getting disk usage without connection', async () => {
    const client = DockerClient.getInstance()
    await expect(client.getDiskUsage()).rejects.toThrow('Docker client not connected')
  })
})
