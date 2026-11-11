import { useState, useEffect, useCallback } from 'react'
import { LogStore, LogFilter, LogEntry } from '../logs/logs'
import { DockerClient } from '../docker/client'

export function LogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogFilter>({ tail: 100, stream: 'all' })
  const [containerId, setContainerId] = useState<string>('')
  const [containers, setContainers] = useState<Array<{ id: string; name: string }>>([])
  const logStore = LogStore.getInstance()
  const dockerClient = DockerClient.getInstance()

  const loadContainers = useCallback(async () => {
    if (!dockerClient.isConnected()) return
    try {
      const list = await dockerClient.getContainers()
      setContainers(list.map((c) => ({ id: c.id, name: c.name })))
      if (list.length > 0 && !containerId) {
        setContainerId(list[0].id)
      }
    } catch {
      // Ignore errors during container listing
    }
  }, [dockerClient, containerId])

  const loadLogs = useCallback(async () => {
    if (!containerId) return
    try {
      const entries = await logStore.fetchLogs(containerId, { tail: filter.tail })
      setLogs(entries)
    } catch {
      // Ignore errors during log fetching
    }
  }, [logStore, containerId, filter.tail])

  useEffect(() => {
    loadContainers()
  }, [loadContainers])

  useEffect(() => {
    loadLogs()
    const interval = setInterval(loadLogs, 3000)
    return () => clearInterval(interval)
  }, [loadLogs])

  const handleFilterChange = (key: keyof LogFilter, value: string | number) => {
    setFilter((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="log-panel">
      <h2>Container Logs</h2>
      <div className="log-controls">
        <select
          value={containerId}
          onChange={(e) => setContainerId(e.target.value)}
          className="container-select"
        >
          <option value="">Select container</option>
          {containers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={filter.tail || 100}
          onChange={(e) => handleFilterChange('tail', parseInt(e.target.value) || 100)}
          className="tail-input"
          placeholder="Tail"
          min={1}
          max={10000}
        />
        <select
          value={filter.stream}
          onChange={(e) => handleFilterChange('stream', e.target.value)}
          className="stream-select"
        >
          <option value="all">All</option>
          <option value="stdout">Stdout</option>
          <option value="stderr">Stderr</option>
        </select>
        <input
          type="text"
          placeholder="Search logs..."
          onChange={(e) => handleFilterChange('search', e.target.value)}
          className="search-input"
        />
      </div>
      <div className="log-output">
        {logs.length === 0 ? (
          <p className="no-data">No logs available</p>
        ) : (
          <pre className="log-lines">
            {logs.map((entry, i) => (
              <div key={i} className={`log-line ${entry.stream}`}>
                {entry.timestamp && <span className="log-timestamp">{entry.timestamp}</span>}
                <span className="log-message">{entry.message}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  )
}
