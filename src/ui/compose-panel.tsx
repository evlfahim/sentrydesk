import { useState, useCallback } from 'react'
import {
  ComposeFile,
  ComposeConfig,
  ComposeService,
  ComposeNetwork,
  ComposeVolume,
  ComposeValidationError,
  parseComposeFile,
  getServiceSummary,
} from '../compose/compose'
import './styles.css'

interface ComposePanelProps {
  initialContent?: string
  initialProjectName?: string
}

export function ComposePanel({ initialContent, initialProjectName }: ComposePanelProps) {
  const [yamlInput, setYamlInput] = useState(initialContent || '')
  const [projectName, setProjectName] = useState(initialProjectName || '')
  const [parsedFile, setParsedFile] = useState<ComposeFile | null>(null)
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'validation'>('editor')

  const handleParse = useCallback(() => {
    const file = parseComposeFile(yamlInput, projectName || undefined)
    setParsedFile(file)
    if (file.config && file.errors.length === 0) {
      setActiveTab('preview')
    } else if (file.errors.length > 0) {
      setActiveTab('validation')
    }
  }, [yamlInput, projectName])

  const handleLoadSample = useCallback(() => {
    const sampleYaml = `name: myapp
version: "3.8"

services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
    environment:
      NGINX_HOST: example.com
      NGINX_PORT: 80
    depends_on:
      - api
    restart: unless-stopped
    networks:
      - frontend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost"]
      interval: 30s
      timeout: 10s
      retries: 3

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DB_HOST: db
    depends_on:
      - db
    restart: unless-stopped
    networks:
      - frontend
      - backend

  db:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret
    volumes:
      - db-data:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - backend

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

volumes:
  db-data:
    driver: local
`
    setYamlInput(sampleYaml)
    setProjectName('myapp')
    setParsedFile(null)
  }, [])

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const renderServiceCard = (service: ComposeService) => {
    const status = service.image ? 'image' : 'build'
    return (
      <div key={service.name} className="compose-service-card">
        <div className="compose-service-header">
          <span className="compose-service-name">{service.name}</span>
          <span className="compose-service-status">{status}</span>
        </div>
      {service.image && (
        <div className="compose-service-detail">
          <strong>Image:</strong> {service.image}
        </div>
      )}
      {service.build && (
        <div className="compose-service-detail">
          <strong>Build:</strong>{' '}
          {typeof service.build === 'string'
            ? service.build
            : `${service.build.context}${service.build.dockerfile ? '/' + service.build.dockerfile : ''}`}
        </div>
      )}
      {service.ports && service.ports.length > 0 && (
        <div className="compose-service-detail">
          <strong>Ports:</strong>{' '}
          {service.ports.map((p, i) => (
            <span key={i} className="compose-port">
              {p.host}:{p.container}
            </span>
          ))}
        </div>
      )}
      {service.environment && Object.keys(service.environment).length > 0 && (
        <div className="compose-service-detail">
          <strong>Environment:</strong> {Object.keys(service.environment).length} vars
        </div>
      )}
      {service.dependsOn && service.dependsOn.length > 0 && (
        <div className="compose-service-detail">
          <strong>Depends on:</strong>{' '}
          {service.dependsOn.map((d, i) => (
            <span key={i} className="compose-dep">
              {d}
            </span>
          ))}
        </div>
      )}
      {service.restart && (
        <div className="compose-service-detail">
          <strong>Restart:</strong> {service.restart}
        </div>
      )}
      </div>
    )
  }

  const renderPreview = () => {
    if (!parsedFile?.config) return null
    const config = parsedFile.config

    return (
      <div className="compose-preview">
        <div className="compose-project-info">
          <h3>Project: {config.name}</h3>
          {config.version && <span className="compose-version">v{config.version}</span>}
          <span className="compose-service-count">
            {config.services.length} service{config.services.length !== 1 ? 's' : ''}
          </span>
          {config.networks.length > 0 && (
            <span className="compose-network-count">
              {config.networks.length} network{config.networks.length !== 1 ? 's' : ''}
            </span>
          )}
          {config.volumes.length > 0 && (
            <span className="compose-volume-count">
              {config.volumes.length} volume{config.volumes.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="compose-services">
          <h4>Services</h4>
          {config.services.map(renderServiceCard)}
        </div>

        {config.networks.length > 0 && (
          <div className="compose-section">
            <h4>Networks</h4>
            <div className="compose-networks">
              {config.networks.map((net) => (
                <div key={net.name} className="compose-network-card">
                  <span className="compose-network-name">{net.name}</span>
                  {net.driver && <span className="compose-network-driver">{net.driver}</span>}
                  {net.external && <span className="compose-external">external</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {config.volumes.length > 0 && (
          <div className="compose-section">
            <h4>Volumes</h4>
            <div className="compose-volumes">
              {config.volumes.map((vol) => (
                <div key={vol.name} className="compose-volume-card">
                  <span className="compose-volume-name">{vol.name}</span>
                  {vol.driver && <span className="compose-volume-driver">{vol.driver}</span>}
                  {vol.external && <span className="compose-external">external</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderValidation = () => {
    if (!parsedFile) return null

    return (
      <div className="compose-validation">
        {parsedFile.errors.length === 0 ? (
          <div className="compose-valid">
            <span className="valid-icon">✓</span>
            <p>Compose file is valid!</p>
          </div>
        ) : (
          <div className="compose-errors">
            <h4>Validation Issues ({parsedFile.errors.length})</h4>
            {parsedFile.errors.map((err, i) => (
              <div key={i} className={`validation-error ${err.severity}`}>
                <span className="validation-path">{err.path}</span>
                <span className="validation-message">{err.message}</span>
                <span className={`validation-severity ${err.severity}`}>
                  {err.severity.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="compose-panel">
      <h2>Docker Compose</h2>

      <div className="compose-controls">
        <input
          type="text"
          placeholder="Project name (optional)"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="project-name-input"
        />
        <button onClick={handleParse} className="parse-btn">
          Parse YAML
        </button>
        <button onClick={handleLoadSample} className="sample-btn">
          Load Sample
        </button>
      </div>

      <div className="compose-tabs">
        <button
          className={`tab ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          Editor
        </button>
        <button
          className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          Preview
        </button>
        <button
          className={`tab ${activeTab === 'validation' ? 'active' : ''}`}
          onClick={() => setActiveTab('validation')}
        >
          Validation
        </button>
      </div>

      {activeTab === 'editor' && (
        <textarea
          className="compose-editor"
          value={yamlInput}
          onChange={(e) => setYamlInput(e.target.value)}
          placeholder="Paste your docker-compose.yml content here..."
          spellCheck={false}
        />
      )}

      {activeTab === 'preview' && (
        <div className="compose-preview-container">
          {parsedFile?.config ? (
            renderPreview()
          ) : (
            <p className="no-data">Parse a compose file to see the preview</p>
          )}
        </div>
      )}

      {activeTab === 'validation' && (
        <div className="compose-validation-container">
          {parsedFile ? (
            renderValidation()
          ) : (
            <p className="no-data">Parse a compose file to see validation results</p>
          )}
        </div>
      )}
    </div>
  )
}
