import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  DockerClient,
  MetricsStore,
  LogStore,
  CleanupEngine,
  ContainerInfo,
  MetricsEntry,
  LogEntry,
  CleanupSuggestion,
  ComposeFile,
} from '@sentrydesk/core'

// ---------------------------------------------------------------------------
// Mock vscode module
// ---------------------------------------------------------------------------

const mockShowInformationMessage = vi.fn()
const mockShowErrorMessage = vi.fn()
const mockShowWarningMessage = vi.fn()
const mockShowQuickPick = vi.fn()
const mockShowInputBox = vi.fn()
const mockShowTextDocument = vi.fn()
const mockShowOpenDialog = vi.fn()
const mockCreateTreeView = vi.fn()
const mockFindFiles = vi.fn()
const mockApplyEdit = vi.fn()
const mockOpenTextDocument = vi.fn()
const mockFs = { readFile: vi.fn() }
const mockCommands = { executeCommand: vi.fn() }

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: mockShowInformationMessage,
    showErrorMessage: mockShowErrorMessage,
    showWarningMessage: mockShowWarningMessage,
    showQuickPick: mockShowQuickPick,
    showInputBox: mockShowInputBox,
    showTextDocument: mockShowTextDocument,
    showOpenDialog: mockShowOpenDialog,
    createTreeView: mockCreateTreeView,
  },
  workspace: {
    openTextDocument: mockOpenTextDocument,
    applyEdit: mockApplyEdit,
    findFiles: mockFindFiles,
    fs: mockFs,
  },
  commands: {
    registerCommand: vi.fn((name: string, fn: (...args: any[]) => any) => {
      return { dispose: vi.fn() }
    }),
    executeCommand: mockCommands.executeCommand,
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  TreeItem: class TreeItem {
    tooltip: string | undefined
    description: string | undefined
    iconPath: any
    contextValue: string | undefined
    command: any
    collapsibleState: number
    constructor(label?: string, collapsibleState?: number) {
      if (label !== undefined) {
        Object.defineProperty(this, 'label', { value: label, writable: true, enumerable: true })
      }
      if (collapsibleState !== undefined) {
        this.collapsibleState = collapsibleState
      }
    }
  },
  EventEmitter: class EventEmitter<T> {
    event: any
    fire: any
    dispose: any
    constructor() {
      this.fire = vi.fn()
      this.dispose = vi.fn()
      this.event = vi.fn(() => ({ dispose: vi.fn() }))
    }
  },
  Disposable: class Disposable {
    dispose: any
    constructor() {
      this.dispose = vi.fn()
    }
  },
  ThemeIcon: class ThemeIcon {
    id: string
    color: any
    constructor(id: string, color?: any) {
      this.id = id
      this.color = color
    }
  },
  ThemeColor: class ThemeColor {
    id: string
    constructor(id: string) {
      this.id = id
    }
  },
  Range: class Range {
    startLine: number
    startChar: number
    endLine: number
    endChar: number
    constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
      this.startLine = startLine
      this.startChar = startChar
      this.endLine = endLine
      this.endChar = endChar
    }
  },
  Position: class Position {
    line: number
    character: number
    constructor(line: number, character: number) {
      this.line = line
      this.character = character
    }
  },
  WorkspaceEdit: class WorkspaceEdit {
    replace() { mockApplyEdit(this, vi.fn()) }
  },
  Uri: class Uri {
    scheme: string
    path: string
    static file(path: string) { return { scheme: 'file', path } }
  },
}))

// ---------------------------------------------------------------------------
// Mock @sentrydesk/core
// ---------------------------------------------------------------------------

function createMockDockerClient(): DockerClient {
  return {
    connect: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => true),
    getContainers: vi.fn(() => Promise.resolve([])),
    getContainerStats: vi.fn(() => Promise.resolve(null)),
    restartContainer: vi.fn(() => Promise.resolve()),
    stopContainer: vi.fn(() => Promise.resolve()),
    startContainer: vi.fn(() => Promise.resolve()),
    removeContainer: vi.fn(() => Promise.resolve()),
    getContainerLogs: vi.fn(() => Promise.resolve([])),
    getComposeFiles: vi.fn(() => Promise.resolve([])),
    getComposeFileContent: vi.fn(() => Promise.resolve('')),
    getComposeProjectInfo: vi.fn(() => Promise.resolve(null)),
    getDiskUsage: vi.fn(() => Promise.resolve({
      images: { totalSize: 0, count: 0 },
      volumes: { totalSize: 0, count: 0 },
      buildCache: { totalSize: 0 },
      containers: { totalSize: 0, count: 0 },
    })),
    getInstance: vi.fn(() => createMockDockerClient()),
  } as unknown as DockerClient
}

function createMockMetricsStore(): MetricsStore {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    getMetrics: vi.fn(() => Promise.resolve([])),
    getHistory: vi.fn(() => Promise.resolve([])),
    getContainerNames: vi.fn(() => Promise.resolve([])),
    getContainerIds: vi.fn(() => Promise.resolve([])),
    getCpuPercent: vi.fn(() => 0),
    getMemoryPercent: vi.fn(() => 0),
    getMemoryUsage: vi.fn(() => 0),
    getMemoryLimit: vi.fn(() => 0),
    clear: vi.fn(),
    getTrackedCount: vi.fn(() => 0),
    getHistoryLength: vi.fn(() => 0),
    addListener: vi.fn(() => vi.fn()),
    getInstance: vi.fn(() => createMockMetricsStore()),
  } as unknown as MetricsStore
}

function createMockLogStore(): LogStore {
  return {
    fetchLogs: vi.fn(() => Promise.resolve([])),
    getLogs: vi.fn(() => Promise.resolve([])),
    filterLogs: vi.fn(() => Promise.resolve([])),
    setFollowMode: vi.fn(),
    isFollowMode: vi.fn(() => false),
    clearLogs: vi.fn(),
    getContainerNames: vi.fn(() => Promise.resolve([])),
    getLogCount: vi.fn(() => 0),
    getInstance: vi.fn(() => createMockLogStore()),
  } as unknown as LogStore
}

function createMockCleanupEngine(): CleanupEngine {
  return {
    analyze: vi.fn(() => Promise.resolve()),
    getSuggestions: vi.fn(() => []),
    getTotalSavings: vi.fn(() => 0),
    clear: vi.fn(),
    execute: vi.fn(() => Promise.resolve()),
    getInstance: vi.fn(() => createMockCleanupEngine()),
  } as unknown as CleanupEngine
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VS Code Extension', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Docker client integration', () => {
    it('DockerClient.getInstance() returns a singleton', () => {
      const client1 = DockerClient.getInstance()
      const client2 = DockerClient.getInstance()
      expect(client1).toBe(client2)
    })

    it('MetricsStore.getInstance() returns a singleton', () => {
      const store1 = MetricsStore.getInstance()
      const store2 = MetricsStore.getInstance()
      expect(store1).toBe(store2)
    })

    it('LogStore.getInstance() returns a singleton', () => {
      const store1 = LogStore.getInstance()
      const store2 = LogStore.getInstance()
      expect(store1).toBe(store2)
    })

    it('CleanupEngine.getInstance() returns a singleton', () => {
      const engine1 = CleanupEngine.getInstance()
      const engine2 = CleanupEngine.getInstance()
      expect(engine1).toBe(engine2)
    })
  })

  describe('ContainerTreeProvider', () => {
    it('creates a tree provider with docker client and metrics store', async () => {
      const { ContainerTreeProvider } = await import('../ui/tree')
      const dockerClient = createMockDockerClient()
      const metricsStore = createMockMetricsStore()
      const provider = new ContainerTreeProvider(dockerClient, metricsStore)

      expect(provider).toBeDefined()
      expect(dockerClient.getContainers).toHaveBeenCalled()
    })

    it('returns empty tree when no containers', async () => {
      const { ContainerTreeProvider } = await import('../ui/tree')
      const dockerClient = createMockDockerClient()
      const metricsStore = createMockMetricsStore()
      const provider = new ContainerTreeProvider(dockerClient, metricsStore)

      await provider.refresh()
      const children = await provider.getChildren()

      expect(children).toHaveLength(1)
      expect(children[0].label).toBe('No containers found')
    })

    it('returns container items when containers exist', async () => {
      const { ContainerTreeProvider } = await import('../ui/tree')
      const mockContainers: ContainerInfo[] = [
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
          ports: [],
          created: 1700000000,
        },
      ]
      const dockerClient = createMockDockerClient()
      dockerClient.getContainers = vi.fn(() => Promise.resolve(mockContainers))
      const metricsStore = createMockMetricsStore()
      const provider = new ContainerTreeProvider(dockerClient, metricsStore)

      await provider.refresh()
      const children = await provider.getChildren()

      expect(children).toHaveLength(1)
      // Check that the item has the expected properties
      const item = children[0] as any
      expect(item.label).toBe('nginx')
      expect(item.containerId).toBe('abc123')
      expect(item.state).toBe('running')
      expect(item.description).toContain('running')
    })
  })

  describe('LogPanelProvider', () => {
    it('creates a log panel provider', async () => {
      const { LogPanelProvider } = await import('../ui/logs')
      const logStore = createMockLogStore()
      const provider = new LogPanelProvider(logStore)

      expect(provider).toBeDefined()
      expect(provider.currentContainerId).toBeNull()
    })

    it('shows logs and creates a document', async () => {
      const { LogPanelProvider } = await import('../ui/logs')
      const mockLogs: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00Z', stream: 'stdout', message: 'Hello world' },
      ]
      const logStore = createMockLogStore()
      logStore.fetchLogs = vi.fn(() => Promise.resolve(mockLogs))
      logStore.isFollowMode = vi.fn(() => true)

      mockOpenTextDocument.mockResolvedValue({
        uri: { scheme: 'untitled', path: '' },
        lineCount: 1,
      })
      mockApplyEdit.mockResolvedValue(true)

      const provider = new LogPanelProvider(logStore)
      await provider.showLogs('abc123', 'nginx')

      expect(logStore.fetchLogs).toHaveBeenCalledWith('abc123', { tail: 500 })
      expect(logStore.setFollowMode).toHaveBeenCalledWith('abc123', true)
      expect(mockOpenTextDocument).toHaveBeenCalled()
    })
  })

  describe('MetricsPanelProvider', () => {
    it('creates a metrics panel provider', async () => {
      const { MetricsPanelProvider } = await import('../ui/metrics')
      const metricsStore = createMockMetricsStore()
      const provider = new MetricsPanelProvider(metricsStore)

      expect(provider).toBeDefined()
      expect(provider.currentContainerId).toBeNull()
    })

    it('shows metrics and creates a document', async () => {
      const { MetricsPanelProvider } = await import('../ui/metrics')
      const mockMetrics: MetricsEntry[] = [
        {
          containerId: 'abc123',
          containerName: 'nginx',
          cpuPercent: 25.5,
          memoryUsage: 52428800,
          memoryLimit: 2147483648,
          memoryPercent: 2.44,
          timestamp: 1700000000000,
        },
      ]
      const metricsStore = createMockMetricsStore()
      metricsStore.getMetrics = vi.fn(() => Promise.resolve(mockMetrics))

      mockOpenTextDocument.mockResolvedValue({
        uri: { scheme: 'untitled', path: '' },
        lineCount: 1,
      })
      mockApplyEdit.mockResolvedValue(true)

      const provider = new MetricsPanelProvider(metricsStore)
      await provider.showMetrics('abc123', 'nginx')

      expect(metricsStore.getMetrics).toHaveBeenCalled()
      expect(mockOpenTextDocument).toHaveBeenCalled()
    })
  })

  describe('ComposePanelProvider', () => {
    it('creates a compose panel provider', async () => {
      const { ComposePanelProvider } = await import('../ui/compose')
      const provider = new ComposePanelProvider()

      expect(provider).toBeDefined()
    })

    it('parses compose content', async () => {
      const { ComposePanelProvider } = await import('../ui/compose')
      const composeYaml = `
version: "3"
name: myapp
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
`
      mockOpenTextDocument.mockResolvedValue({
        uri: { scheme: 'untitled', path: '' },
        lineCount: 1,
      })
      mockApplyEdit.mockResolvedValue(true)

      const provider = new ComposePanelProvider()
      await provider.parseContent(composeYaml, 'myapp')

      expect(provider).toBeDefined()
      expect(mockOpenTextDocument).toHaveBeenCalled()
    })
  })

  describe('CleanupPanelProvider', () => {
    it('creates a cleanup panel provider', async () => {
      const { CleanupPanelProvider } = await import('../ui/cleanup')
      const cleanupEngine = createMockCleanupEngine()
      const provider = new CleanupPanelProvider(cleanupEngine)

      expect(provider).toBeDefined()
    })

    it('shows cleanup report', async () => {
      const { CleanupPanelProvider } = await import('../ui/cleanup')
      const mockSuggestions: CleanupSuggestion[] = [
        {
          id: '1',
          type: 'image',
          title: 'Unused image',
          description: 'Dangling image',
          size: 104857600,
          actionable: true,
          action: 'docker image prune',
        },
      ]
      const cleanupEngine = createMockCleanupEngine()
      cleanupEngine.analyze = vi.fn(() => Promise.resolve())
      cleanupEngine.getSuggestions = vi.fn(() => mockSuggestions)
      cleanupEngine.getTotalSavings = vi.fn(() => 104857600)

      mockOpenTextDocument.mockResolvedValue({
        uri: { scheme: 'untitled', path: '' },
        lineCount: 1,
      })
      mockApplyEdit.mockResolvedValue(true)

      const provider = new CleanupPanelProvider(cleanupEngine)
      await provider.showCleanup()

      expect(cleanupEngine.analyze).toHaveBeenCalled()
      expect(mockOpenTextDocument).toHaveBeenCalled()
    })
  })

  describe('Command registration', () => {
    it('docker commands register correctly', async () => {
      const { registerDockerCommands } = await import('../commands/docker')
      const dockerClient = createMockDockerClient()
      const { ContainerTreeProvider } = await import('../ui/tree')
      const metricsStore = createMockMetricsStore()
      const treeProvider = new ContainerTreeProvider(dockerClient, metricsStore)

      const disposables = registerDockerCommands(dockerClient, treeProvider)
      expect(disposables).toHaveLength(7)
    })

    it('log commands register correctly', async () => {
      const { registerLogCommands } = await import('../commands/logs')
      const { LogPanelProvider } = await import('../ui/logs')
      const logStore = createMockLogStore()
      const panelProvider = new LogPanelProvider(logStore)

      const disposables = registerLogCommands(panelProvider, logStore)
      expect(disposables).toHaveLength(3)
    })

    it('metrics commands register correctly', async () => {
      const { registerMetricsCommands } = await import('../commands/metrics')
      const { MetricsPanelProvider } = await import('../ui/metrics')
      const metricsStore = createMockMetricsStore()
      const panelProvider = new MetricsPanelProvider(metricsStore)

      const disposables = registerMetricsCommands(panelProvider, metricsStore)
      expect(disposables).toHaveLength(3)
    })

    it('compose commands register correctly', async () => {
      const { registerComposeCommands } = await import('../commands/compose')
      const { ComposePanelProvider } = await import('../ui/compose')
      const panelProvider = new ComposePanelProvider()

      const disposables = registerComposeCommands(panelProvider)
      expect(disposables).toHaveLength(2)
    })

    it('cleanup commands register correctly', async () => {
      const { registerCleanupCommands } = await import('../commands/cleanup')
      const { CleanupPanelProvider } = await import('../ui/cleanup')
      const cleanupEngine = createMockCleanupEngine()
      const panelProvider = new CleanupPanelProvider(cleanupEngine)

      const disposables = registerCleanupCommands(panelProvider, cleanupEngine)
      expect(disposables).toHaveLength(4)
    })

    it('dashboard commands register correctly', async () => {
      const { registerDashboardCommands } = await import('../commands/dashboard')
      const { ContainerTreeProvider } = await import('../ui/tree')
      const { LogPanelProvider } = await import('../ui/logs')
      const { MetricsPanelProvider } = await import('../ui/metrics')
      const { ComposePanelProvider } = await import('../ui/compose')
      const { CleanupPanelProvider } = await import('../ui/cleanup')
      const metricsStore = createMockMetricsStore()
      const logStore = createMockLogStore()
      const cleanupEngine = createMockCleanupEngine()
      const dockerClient = createMockDockerClient()

      const treeProvider = new ContainerTreeProvider(dockerClient, metricsStore)
      const logPanelProvider = new LogPanelProvider(logStore)
      const metricsPanelProvider = new MetricsPanelProvider(metricsStore)
      const composePanelProvider = new ComposePanelProvider()
      const cleanupPanelProvider = new CleanupPanelProvider(cleanupEngine)

      const disposables = registerDashboardCommands(
        {},
        treeProvider,
        logPanelProvider,
        metricsPanelProvider,
        composePanelProvider,
        cleanupPanelProvider,
      )
      expect(disposables).toHaveLength(1)
    })
  })
})
