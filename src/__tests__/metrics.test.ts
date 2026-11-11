import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MetricsStore, MetricsEntry } from '../metrics/metrics'
import { DockerClient } from '../docker/client'

describe('MetricsStore', () => {
  beforeEach(() => {
    MetricsStore['instance'] = null
  })

  it('should create a singleton instance', () => {
    const store1 = MetricsStore.getInstance()
    const store2 = MetricsStore.getInstance()
    expect(store1).toBe(store2)
  })

  it('should return empty metrics initially', () => {
    const store = MetricsStore.getInstance()
    expect(store.getMetrics()).toEqual([])
  })

  it('should return empty history for unknown container', () => {
    const store = MetricsStore.getInstance()
    expect(store.getHistory('unknown-container')).toEqual([])
  })

  it('should return empty container names initially', () => {
    const store = MetricsStore.getInstance()
    expect(store.getContainerNames()).toEqual([])
  })

  it('should clear all metrics', () => {
    const store = MetricsStore.getInstance()
    store.clear()
    expect(store.getMetrics()).toEqual([])
  })

  it('should start and stop interval', () => {
    const store = MetricsStore.getInstance()
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

    store.start()
    // Interval should be set
    expect(store['intervalId']).toBeDefined()

    store.stop()
    // Interval should be cleared
    expect(store['intervalId']).toBeNull()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('should not start interval twice', () => {
    const store = MetricsStore.getInstance()
    store.start()
    const firstInterval = store['intervalId']
    store.start()
    expect(store['intervalId']).toBe(firstInterval)
    store.stop()
  })

  describe('updateMetrics', () => {
    it('should not update when Docker is not connected', async () => {
      const store = MetricsStore.getInstance()
      await store['updateMetrics']()
      expect(store.getMetrics()).toEqual([])
    })
  })
})
