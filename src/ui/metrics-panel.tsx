import { useState, useEffect, useCallback } from 'react'
import { MetricsStore, MetricsEntry } from '../metrics/metrics'
import { DockerClient } from '../docker/client'

export function MetricsPanel() {
  const [metrics, setMetrics] = useState<MetricsEntry[]>([])
  const metricsStore = MetricsStore.getInstance()
  const dockerClient = DockerClient.getInstance()

  const refreshMetrics = useCallback(async () => {
    if (!dockerClient.isConnected()) {
      setMetrics([])
      return
    }
    const entries = metricsStore.getMetrics()
    setMetrics(entries)
  }, [dockerClient, metricsStore])

  useEffect(() => {
    // Subscribe to real-time updates
    const unsubscribe = metricsStore.subscribe((entries) => {
      setMetrics(entries)
    })

    // Initial fetch
    refreshMetrics()

    // Also poll in case subscribe doesn't fire immediately
    const interval = setInterval(refreshMetrics, 2000)

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [refreshMetrics, metricsStore])

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="metrics-panel">
      <h2>Container Metrics</h2>
      {metrics.length === 0 ? (
        <p className="no-data">No containers running or Docker not connected</p>
      ) : (
        <table className="metrics-table">
          <thead>
            <tr>
              <th>Container</th>
              <th>CPU %</th>
              <th>Memory</th>
              <th>Memory %</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.containerId}>
                <td className="container-name">{m.containerName}</td>
                <td>
                  <span className={`cpu-bar ${m.cpuPercent > 80 ? 'high' : m.cpuPercent > 50 ? 'medium' : ''}`}>
                    {m.cpuPercent.toFixed(1)}%
                  </span>
                </td>
                <td>{formatBytes(m.memoryUsage)} / {formatBytes(m.memoryLimit)}</td>
                <td>
                  <span className={`mem-bar ${m.memoryPercent > 80 ? 'high' : m.memoryPercent > 50 ? 'medium' : ''}`}>
                    {m.memoryPercent.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
