import { useState, useEffect, useCallback } from 'react'
import { CleanupEngine, CleanupSuggestion } from '../disk/cleanup'
import { DockerClient } from '../docker/client'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function CleanupPanel() {
  const [suggestions, setSuggestions] = useState<CleanupSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const cleanupEngine = CleanupEngine.getInstance()
  const dockerClient = DockerClient.getInstance()

  const analyze = useCallback(async () => {
    setLoading(true)
    try {
      const results = await cleanupEngine.analyze()
      setSuggestions(results)
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [cleanupEngine])

  useEffect(() => {
    analyze()
  }, [analyze])

  return (
    <div className="cleanup-panel">
      <h2>Disk Space</h2>
      <button onClick={analyze} disabled={loading} className="analyze-btn">
        {loading ? 'Analyzing...' : 'Analyze Disk Space'}
      </button>
      {suggestions.length === 0 ? (
        <p className="no-data">No cleanup suggestions</p>
      ) : (
        <div className="suggestions-list">
          {suggestions.map((s) => (
            <div key={s.id} className="suggestion-card">
              <div className="suggestion-header">
                <span className={`suggestion-type ${s.type}`}>{s.type}</span>
                <span className="suggestion-title">{s.title}</span>
              </div>
              <p className="suggestion-desc">{s.description}</p>
              {s.size > 0 && <span className="suggestion-size">{formatBytes(s.size)}</span>}
              {s.actionable && (
                <button className="action-btn" onClick={() => alert(`Action: ${s.action}`)}>
                  {s.action}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
