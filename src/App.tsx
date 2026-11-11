import { useState, useEffect } from 'react'
import { DockerClient } from './docker/client'
import { MetricsStore } from './metrics/metrics'
import { LogStore } from './logs/logs'
import { CleanupEngine } from './disk/cleanup'
import './App.css'

function App() {
  const [dockerConnected, setDockerConnected] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [platform, setPlatform] = useState('')

  useEffect(() => {
    const init = async () => {
      try {
        const version = await window.electronAPI.getVersion()
        const plat = await window.electronAPI.getPlatform()
        setAppVersion(version)
        setPlatform(plat as string)
      } catch {
        // Running in browser, no Electron API
      }

      try {
        const client = DockerClient.getInstance()
        await client.connect()
        setDockerConnected(true)
      } catch {
        setDockerConnected(false)
      }
    }
    init()
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>SentryDesk</h1>
        <div className="header-info">
          <span className={`status ${dockerConnected ? 'connected' : 'disconnected'}`}>
            {dockerConnected ? '● Docker Connected' : '○ Docker Disconnected'}
          </span>
          {appVersion && <span className="version">v{appVersion}</span>}
          {platform && <span className="platform">{platform}</span>}
        </div>
      </header>
      <main className="app-main">
        <MetricsStore />
        <LogStore />
        <CleanupEngine />
      </main>
    </div>
  )
}

export default App
