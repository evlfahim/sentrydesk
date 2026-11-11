import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DockerClient } from '../docker/client'
import Dockerode from 'dockerode'

describe('DockerClient', () => {
  beforeEach(() => {
    // Reset singleton
    DockerClient['instance'] = null
  })

  it('should create a singleton instance', () => {
    const client1 = DockerClient.getInstance()
    const client2 = DockerClient.getInstance()
    expect(client1).toBe(client2)
  })

  it('should not be connected initially', () => {
    const client = DockerClient.getInstance()
    expect(client.isConnected()).toBe(false)
  })

  it('should return null docker instance before connecting', () => {
    const client = DockerClient.getInstance()
    expect(client.getDocker()).toBeNull()
  })

  describe('connect', () => {
    it('should throw when Docker daemon is not available', async () => {
      const client = DockerClient.getInstance()
      // Dockerode will fail to connect in test environment
      await expect(client.connect()).rejects.toThrow('Docker connection failed')
    })
  })

  describe('getContainers', () => {
    it('should throw when not connected', async () => {
      const client = DockerClient.getInstance()
      await expect(client.getContainers()).rejects.toThrow('Docker client not connected')
    })
  })

  describe('getContainerStats', () => {
    it('should throw when not connected', async () => {
      const client = DockerClient.getInstance()
      await expect(client.getContainerStats('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })
  })

  describe('restartContainer', () => {
    it('should throw when not connected', async () => {
      const client = DockerClient.getInstance()
      await expect(client.restartContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })
  })

  describe('stopContainer', () => {
    it('should throw when not connected', async () => {
      const client = DockerClient.getInstance()
      await expect(client.stopContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })
  })

  describe('startContainer', () => {
    it('should throw when not connected', async () => {
      const client = DockerClient.getInstance()
      await expect(client.startContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })
  })

  describe('removeContainer', () => {
    it('should throw when not connected', async () => {
      const client = DockerClient.getInstance()
      await expect(client.removeContainer('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })
  })

  describe('getContainerLogs', () => {
    it('should throw when not connected', async () => {
      const client = DockerClient.getInstance()
      await expect(client.getContainerLogs('test-container')).rejects.toThrow(
        'Docker client not connected',
      )
    })
  })

  describe('getComposeFiles', () => {
    it('should throw when not connected', async () => {
      const client = DockerClient.getInstance()
      await expect(client.getComposeFiles()).rejects.toThrow('Docker client not connected')
    })
  })

  describe('getDiskUsage', () => {
    it('should throw when not connected', async () => {
      const client = DockerClient.getInstance()
      await expect(client.getDiskUsage()).rejects.toThrow('Docker client not connected')
    })
  })
})
