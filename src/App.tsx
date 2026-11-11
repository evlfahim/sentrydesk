import { useState, useEffect } from 'react'
import { DockerClient } from './docker/client'
import { MetricsPanel } from './ui/metrics-panel'
import { LogPanel } from './ui/log-panel'
import { CleanupPanel } from './ui/cleanup-panel'
import { ComposePanel } from './ui/compose-panel'
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
        <MetricsPanel />
        <LogPanel />
        <ComposePanel />
        <CleanupPanel />
      </main>
    </div>
  )
}

export default App
