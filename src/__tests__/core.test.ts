import { describe, it, expect, beforeEach } from 'vitest'
import { MetricsStore } from '../metrics/metrics'
import { LogStore } from '../logs/logs'
import { CleanupEngine } from '../disk/cleanup'
import { DockerClient } from '../docker/client'

describe('Core Package', () => {
  beforeEach(() => {
    DockerClient['instance'] = null
    MetricsStore['instance'] = null
    LogStore['instance'] = null
    CleanupEngine['instance'] = null
  })

  it('should have DockerClient as singleton', () => {
    const c1 = DockerClient.getInstance()
    const c2 = DockerClient.getInstance()
    expect(c1).toBe(c2)
  })

  it('should have MetricsStore as singleton', () => {
    const m1 = MetricsStore.getInstance()
    const m2 = MetricsStore.getInstance()
    expect(m1).toBe(m2)
  })

  it('should have LogStore as singleton', () => {
    const l1 = LogStore.getInstance()
    const l2 = LogStore.getInstance()
    expect(l1).toBe(l2)
  })

  it('should have CleanupEngine as singleton', () => {
    const c1 = CleanupEngine.getInstance()
    const c2 = CleanupEngine.getInstance()
    expect(c1).toBe(c2)
  })

  it('should have DockerClient not connected initially', () => {
    const client = DockerClient.getInstance()
    expect(client.isConnected()).toBe(false)
  })

  it('should have MetricsStore with empty metrics initially', () => {
    const store = MetricsStore.getInstance()
    expect(store.getMetrics()).toEqual([])
  })

  it('should have LogStore with empty logs initially', () => {
    const store = LogStore.getInstance()
    expect(store.getLogs('test')).toEqual([])
  })

  it('should have CleanupEngine with empty suggestions initially', () => {
    const engine = CleanupEngine.getInstance()
    expect(engine.getSuggestions()).toEqual([])
    expect(engine.getTotalSavings()).toBe(0)
  })
})
