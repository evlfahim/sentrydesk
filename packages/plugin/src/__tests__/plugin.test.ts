import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  DockerClient,
  MetricsStore,
  LogStore,
  CleanupEngine,
  ContainerInfo,
  MetricsEntry,
  LogEntry,
  CleanupSuggestion,
} from '@sentrydesk/core'

// ---------------------------------------------------------------------------
// Mock vscode module
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const commands = new Map<string, (...args: any[]) => any>()
  const terminal = { show: vi.fn(), sendText: vi.fn(), dispose: vi.fn() }
  const config = { get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue) }
  return {
    commands,
    terminal,
    config,
    window: {
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showQuickPick: vi.fn(),
      showInputBox: vi.fn(),
      showTextDocument: vi.fn(),
      showOpenDialog: vi.fn(),
      createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
      createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() })),
      createTerminal: vi.fn(() => terminal),
    },
    workspace: {
      openTextDocument: vi.fn(),
      applyEdit: vi.fn(),
      findFiles: vi.fn(),
      asRelativePath: vi.fn((uri: any) => uri.fsPath),
      fs: { readFile: vi.fn() },
      getConfiguration: vi.fn(() => config),
    },
    executeCommand: vi.fn(),
  }
})

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = []
    event = (listener: (e: T) => void) => {
      this.listeners.push(listener)
      return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) }
    }
    fire = vi.fn((e?: T) => {
      for (const l of this.listeners) l(e as T)
    })
    dispose = vi.fn()
  }

  class TreeItem {
    label: any
    description: any
    tooltip: any
    iconPath: any
    contextValue: any
    command: any
    collapsibleState: any
    constructor(label: any, collapsibleState?: number) {
      this.label = label
      this.collapsibleState = collapsibleState
    }
  }

  return {
    window: h.window,
    workspace: h.workspace,
    commands: {
      registerCommand: vi.fn((name: string, fn: (...args: any[]) => any) => {
        h.commands.set(name, fn)
        return { dispose: vi.fn(() => h.commands.delete(name)) }
      }),
      executeCommand: h.executeCommand,
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    TreeItem,
    EventEmitter,
    ThemeIcon: class ThemeIcon {
      constructor(public id: string, public color?: any) {}
    },
    ThemeColor: class ThemeColor {
      constructor(public id: string) {}
    },
    Position: class Position {
      constructor(public line: number, public character: number) {}
    },
    Range: class Range {
      constructor(public start: any, public end: any) {}
    },
    WorkspaceEdit: class WorkspaceEdit {
      replace = vi.fn()
    },
    Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p, path: p }) },
  }
})

// No real Docker daemon in tests: the default client can never connect
vi.mock('dockerode', () => ({
  default: class Dockerode {
    ping() {
      return Promise.reject(new Error('no docker daemon in tests'))
    }
  },
}))

// ---------------------------------------------------------------------------
// Mock core services
// ---------------------------------------------------------------------------

const sampleContainer: ContainerInfo = {
  id: 'abc123def456789',
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
}

function createMockDockerClient(containers: ContainerInfo[] = [], connected = true) {
  const image = { remove: vi.fn(() => Promise.resolve()) }
  const volume = { remove: vi.fn(() => Promise.resolve()) }
  const docker = {
    getImage: vi.fn(() => image),
    getVolume: vi.fn(() => volume),
  }
  return {
    image,
    volume,
    docker,
    client: {
      connect: vi.fn(() => Promise.resolve()),
      isConnected: vi.fn(() => connected),
      getDocker: vi.fn(() => docker),
      getContainers: vi.fn(() => Promise.resolve(containers)),
      getContainerStats: vi.fn(() => Promise.resolve(null)),
      restartContainer: vi.fn(() => Promise.resolve()),
      stopContainer: vi.fn(() => Promise.resolve()),
      startContainer: vi.fn(() => Promise.resolve()),
      removeContainer: vi.fn(() => Promise.resolve()),
      getContainerLogs: vi.fn(() => Promise.resolve([])),
      getDiskUsage: vi.fn(() => Promise.resolve(null)),
    } as unknown as DockerClient,
  }
}

function createMockMetricsStore(entries: MetricsEntry[] = []) {
  let listener: ((e: MetricsEntry[]) => void) | null = null
  const store = {
    start: vi.fn(),
    stop: vi.fn(),
    subscribe: vi.fn((l: (e: MetricsEntry[]) => void) => {
      listener = l
      return vi.fn()
    }),
    getMetrics: vi.fn(() => entries),
    getHistory: vi.fn(() => entries),
    getContainerNames: vi.fn(() => []),
    getContainerIds: vi.fn(() => []),
    clear: vi.fn(),
    getTrackedCount: vi.fn(() => entries.length),
  } as unknown as MetricsStore
  return { store, emit: (e: MetricsEntry[]) => listener?.(e) }
}

function createMockLogStore(logs: LogEntry[] = []) {
  return {
    fetchLogs: vi.fn(() => Promise.resolve(logs)),
    getLogs: vi.fn(() => logs),
    filterLogs: vi.fn(() => logs.slice(0, 1)),
    setFollowMode: vi.fn(),
    isFollowMode: vi.fn(() => true),
    clearLogs: vi.fn(),
    getContainerNames: vi.fn(() => []),
    getLogCount: vi.fn(() => logs.length),
  } as unknown as LogStore
}

function createMockCleanupEngine(suggestions: CleanupSuggestion[] = []) {
  return {
    analyze: vi.fn(() => Promise.resolve(suggestions)),
    getSuggestions: vi.fn(() => suggestions),
    getTotalSavings: vi.fn(() => suggestions.reduce((sum, s) => sum + s.size, 0)),
    clear: vi.fn(),
  } as unknown as CleanupEngine
}

function lastOpenedContent(): string {
  const calls = h.workspace.openTextDocument.mock.calls
  return (calls[calls.length - 1] as any[])[0].content
}

function mockDocument() {
  return { uri: { scheme: 'untitled', path: '' }, lineCount: 1, isClosed: false }
}

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'))
const contributedCommands: string[] = pkg.contributes.commands.map((c: { command: string }) => c.command)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VS Code Extension', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.commands.clear()
    h.workspace.openTextDocument.mockImplementation(() => Promise.resolve(mockDocument()))
    h.workspace.applyEdit.mockResolvedValue(true)
    h.config.get.mockImplementation((_key: string, defaultValue?: unknown) => defaultValue)
  })

  describe('@sentrydesk/core integration', () => {
    it('core singletons are shared with the extension', () => {
      expect(DockerClient.getInstance()).toBe(DockerClient.getInstance())
      expect(MetricsStore.getInstance()).toBe(MetricsStore.getInstance())
      expect(LogStore.getInstance()).toBe(LogStore.getInstance())
      expect(CleanupEngine.getInstance()).toBe(CleanupEngine.getInstance())
    })
  })

  describe('ContainerTreeProvider', () => {
    it('fetches containers on refresh, not in the constructor', async () => {
      const { ContainerTreeProvider } = await import('../ui/tree')
      const { client } = createMockDockerClient()
      const { store } = createMockMetricsStore()
      const provider = new ContainerTreeProvider(client, store)

      expect(client.getContainers).not.toHaveBeenCalled()
      expect(store.subscribe).toHaveBeenCalledTimes(1)
      await provider.refresh()
      expect(client.getContainers).toHaveBeenCalledTimes(1)
    })

    it('shows a placeholder when there are no containers', async () => {
      const { ContainerTreeProvider } = await import('../ui/tree')
      const { client } = createMockDockerClient([])
      const provider = new ContainerTreeProvider(client, createMockMetricsStore().store)

      await provider.refresh()
      const children = await provider.getChildren()

      expect(children).toHaveLength(1)
      expect(children[0].label).toBe('No containers found')
      expect(children[0].contextValue).toBe('placeholder')
    })

    it('does not query Docker when disconnected', async () => {
      const { ContainerTreeProvider } = await import('../ui/tree')
      const { client } = createMockDockerClient([sampleContainer], false)
      const provider = new ContainerTreeProvider(client, createMockMetricsStore().store)

      await provider.refresh()
      expect(client.getContainers).not.toHaveBeenCalled()
      expect(await provider.getChildren()).toHaveLength(1)
    })

    it('returns container items with metrics from the store', async () => {
      const { ContainerTreeProvider } = await import('../ui/tree')
      const { client } = createMockDockerClient([sampleContainer])
      const metrics = createMockMetricsStore()
      const provider = new ContainerTreeProvider(client, metrics.store)
      const changed = vi.fn()
      provider.onDidChangeTreeData(changed)

      await provider.refresh()
      metrics.emit([
        {
          containerId: sampleContainer.id,
          containerName: 'nginx',
          cpuPercent: 12.34,
          memoryUsage: 1024,
          memoryLimit: 2048,
          memoryPercent: 50,
          timestamp: 1700000000000,
        },
      ])
      const children = await provider.getChildren()

      expect(changed).toHaveBeenCalledTimes(2)
      expect(children).toHaveLength(1)
      const item = children[0]
      expect(item.label).toBe('nginx')
      expect(item.containerId).toBe(sampleContainer.id)
      expect(item.state).toBe('running')
      expect(item.contextValue).toBe('container-running')
      expect(item.description).toBe('running | CPU: 12.3% | MEM: 50.0%')
      expect(await provider.getChildren(item)).toEqual([])
    })

    it('clear() empties the tree', async () => {
      const { ContainerTreeProvider } = await import('../ui/tree')
      const { client } = createMockDockerClient([sampleContainer])
      const provider = new ContainerTreeProvider(client, createMockMetricsStore().store)

      await provider.refresh()
      expect(provider.getContainers()).toHaveLength(1)
      provider.clear()
      expect(provider.getContainers()).toHaveLength(0)
    })
  })

  describe('LogPanelProvider', () => {
    const logs: LogEntry[] = [
      { timestamp: '2024-01-01T00:00:00Z', stream: 'stdout', message: 'Hello world' },
      { timestamp: null, stream: 'stderr', message: 'Something failed' },
    ]

    it('starts with no container selected', async () => {
      const { LogPanelProvider } = await import('../ui/logs')
      const provider = new LogPanelProvider(createMockLogStore())
      expect(provider.currentContainerId).toBeNull()
    })

    it('fetches logs, opens a document and enables follow mode', async () => {
      const { LogPanelProvider } = await import('../ui/logs')
      const logStore = createMockLogStore(logs)
      const provider = new LogPanelProvider(logStore)

      await provider.showLogs('abc123', 'nginx')

      expect(logStore.fetchLogs).toHaveBeenCalledWith('abc123', { tail: 500 })
      expect(logStore.setFollowMode).toHaveBeenCalledWith('abc123', true)
      expect(h.workspace.openTextDocument).toHaveBeenCalledTimes(1)
      const content = lastOpenedContent()
      expect(content).toContain('# Logs: nginx')
      expect(content).toContain('2024-01-01T00:00:00Z [stdout] Hello world')
      expect(content).toContain('[stderr] Something failed')
      expect(provider.currentContainerId).toBe('abc123')
      provider.dispose()
      expect(logStore.setFollowMode).toHaveBeenLastCalledWith('abc123', false)
    })

    it('reuses the open document on subsequent renders', async () => {
      const { LogPanelProvider } = await import('../ui/logs')
      const logStore = createMockLogStore(logs)
      const provider = new LogPanelProvider(logStore)

      await provider.showLogs('abc123', 'nginx')
      await provider.search('hello')

      expect(logStore.filterLogs).toHaveBeenCalledWith('abc123', { search: 'hello' })
      expect(h.workspace.openTextDocument).toHaveBeenCalledTimes(1)
      expect(h.workspace.applyEdit).toHaveBeenCalledTimes(1)
      provider.dispose()
    })
  })

  describe('MetricsPanelProvider', () => {
    it('shows metrics history for the selected container', async () => {
      const { MetricsPanelProvider } = await import('../ui/metrics')
      const entries: MetricsEntry[] = [
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
      const { store } = createMockMetricsStore(entries)
      const provider = new MetricsPanelProvider(store)
      expect(provider.currentContainerId).toBeNull()

      await provider.showMetrics('abc123', 'nginx')

      expect(store.getMetrics).toHaveBeenCalledWith('abc123')
      const content = lastOpenedContent()
      expect(content).toContain('# Metrics for nginx')
      expect(content).toContain('25.50%')
      expect(content).toContain('50.00 MB')
      expect(content).toContain('2048.00 MB')
      provider.dispose()
    })

    it('explains when no metrics are available', async () => {
      const { MetricsPanelProvider } = await import('../ui/metrics')
      const provider = new MetricsPanelProvider(createMockMetricsStore([]).store)

      await provider.showMetrics('abc123')

      expect(lastOpenedContent()).toContain('No metrics available yet')
      provider.dispose()
    })
  })

  describe('ComposePanelProvider', () => {
    it('parses and renders compose content', async () => {
      const { ComposePanelProvider } = await import('../ui/compose')
      const composeYaml = `
version: "3"
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
`
      const provider = new ComposePanelProvider()
      const result = await provider.parseContent(composeYaml, 'myapp')

      expect(result.config).not.toBeNull()
      expect(result.config!.name).toBe('myapp')
      expect(result.config!.services.map((s) => s.name)).toEqual(['web'])
      expect(provider.currentResult).toBe(result)
      const content = lastOpenedContent()
      expect(content).toContain('# Project: myapp')
      expect(content).toContain('### web')
      expect(content).toContain('- Image: `nginx:latest`')
      expect(content).toContain('- Ports: 80:80')
    })

    it('reports invalid YAML as a validation error', async () => {
      const { ComposePanelProvider } = await import('../ui/compose')
      const provider = new ComposePanelProvider()
      const result = await provider.parseContent('services: [unclosed')

      expect(result.config).toBeNull()
      expect(result.errors[0].severity).toBe('error')
      expect(lastOpenedContent()).toContain('Failed to parse YAML content')
    })

    it('reads a compose file found in the workspace', async () => {
      const { ComposePanelProvider } = await import('../ui/compose')
      h.workspace.findFiles.mockResolvedValue([{ fsPath: '/repo/docker-compose.yml' }])
      h.workspace.fs.readFile.mockResolvedValue(
        new TextEncoder().encode('services:\n  api:\n    image: node:20\n'),
      )

      const provider = new ComposePanelProvider()
      await provider.showCompose()

      expect(provider.currentResult!.path).toBe('/repo/docker-compose.yml')
      expect(lastOpenedContent()).toContain('### api')
    })
  })

  describe('CleanupPanelProvider', () => {
    it('analyzes and renders a cleanup report', async () => {
      const { CleanupPanelProvider } = await import('../ui/cleanup')
      const engine = createMockCleanupEngine([
        {
          id: '1',
          type: 'image',
          title: 'Unused image',
          description: 'Dangling image',
          size: 104857600,
          actionable: true,
          action: 'Remove dangling image',
          targetId: 'sha256:abc',
        },
      ])
      const provider = new CleanupPanelProvider(engine)

      await provider.showCleanup()

      expect(engine.analyze).toHaveBeenCalled()
      const content = lastOpenedContent()
      expect(content).toContain('Total potential savings: 100 MB')
      expect(content).toContain('## Unused Images (1 items, 100 MB)')
      expect(content).toContain('`sha256:abc`')
    })

    it('reports a clean disk when there are no suggestions', async () => {
      const { CleanupPanelProvider } = await import('../ui/cleanup')
      const provider = new CleanupPanelProvider(createMockCleanupEngine([]))

      await provider.showCleanup()

      expect(lastOpenedContent()).toContain('Your disk is clean!')
    })
  })

  describe('Command registration', () => {
    it('docker commands register and act on tree items', async () => {
      const { registerDockerCommands } = await import('../commands/docker')
      const { ContainerTreeProvider } = await import('../ui/tree')
      const { client } = createMockDockerClient([sampleContainer])
      const { store } = createMockMetricsStore()
      const treeProvider = new ContainerTreeProvider(client, store)

      const disposables = registerDockerCommands(client, treeProvider, store)
      expect(disposables).toHaveLength(7)

      const node = { containerId: sampleContainer.id, containerName: 'nginx' }
      await h.commands.get('sentrydesk.restart')!(node)
      expect(client.restartContainer).toHaveBeenCalledWith(sampleContainer.id)
      expect(client.getContainers).toHaveBeenCalled()

      await h.commands.get('sentrydesk.stop')!(node)
      expect(client.stopContainer).toHaveBeenCalledWith(sampleContainer.id)

      await h.commands.get('sentrydesk.start')!(node)
      expect(client.startContainer).toHaveBeenCalledWith(sampleContainer.id)

      await h.commands.get('sentrydesk.connect')!()
      expect(client.connect).toHaveBeenCalled()
      expect(store.start).toHaveBeenCalled()

      await h.commands.get('sentrydesk.disconnect')!()
      expect(store.stop).toHaveBeenCalled()
      expect(treeProvider.getContainers()).toHaveLength(0)
    })

    it('remove asks for confirmation first', async () => {
      const { registerDockerCommands } = await import('../commands/docker')
      const { ContainerTreeProvider } = await import('../ui/tree')
      const { client } = createMockDockerClient([sampleContainer])
      const treeProvider = new ContainerTreeProvider(client, createMockMetricsStore().store)
      registerDockerCommands(client, treeProvider)
      const node = { containerId: sampleContainer.id, containerName: 'nginx' }

      h.window.showWarningMessage.mockResolvedValueOnce(undefined)
      await h.commands.get('sentrydesk.remove')!(node)
      expect(client.removeContainer).not.toHaveBeenCalled()

      h.window.showWarningMessage.mockResolvedValueOnce('Yes')
      await h.commands.get('sentrydesk.remove')!(node)
      expect(client.removeContainer).toHaveBeenCalledWith(sampleContainer.id, true)
    })

    it('palette commands pick a container when no tree item is given', async () => {
      const { registerDockerCommands } = await import('../commands/docker')
      const { ContainerTreeProvider } = await import('../ui/tree')
      const { client } = createMockDockerClient([sampleContainer])
      registerDockerCommands(client, new ContainerTreeProvider(client, createMockMetricsStore().store))

      h.window.showQuickPick.mockImplementationOnce((items: any[]) => Promise.resolve(items[0]))
      await h.commands.get('sentrydesk.restart')!()

      expect(client.restartContainer).toHaveBeenCalledWith(sampleContainer.id)
    })

    it('palette commands warn when Docker is not connected', async () => {
      const { registerDockerCommands } = await import('../commands/docker')
      const { ContainerTreeProvider } = await import('../ui/tree')
      const { client } = createMockDockerClient([], false)
      registerDockerCommands(client, new ContainerTreeProvider(client, createMockMetricsStore().store))

      await h.commands.get('sentrydesk.restart')!()

      expect(h.window.showWarningMessage).toHaveBeenCalled()
      expect(client.restartContainer).not.toHaveBeenCalled()
    })

    it('log commands register and open logs for a tree item', async () => {
      const { registerLogCommands } = await import('../commands/logs')
      const { LogPanelProvider } = await import('../ui/logs')
      const logStore = createMockLogStore()
      const panelProvider = new LogPanelProvider(logStore)
      const { client } = createMockDockerClient()

      const disposables = registerLogCommands(panelProvider, logStore, client)
      expect(disposables).toHaveLength(4)

      await h.commands.get('sentrydesk.viewLogs')!({ containerId: 'abc123', containerName: 'nginx' })
      expect(logStore.fetchLogs).toHaveBeenCalledWith('abc123', { tail: 500 })

      await h.commands.get('sentrydesk.toggleFollow')!()
      expect(logStore.setFollowMode).toHaveBeenLastCalledWith('abc123', false)

      await h.commands.get('sentrydesk.clearLogs')!()
      expect(logStore.clearLogs).toHaveBeenCalledWith('abc123')
      panelProvider.dispose()
    })

    it('metrics commands register and control collection', async () => {
      const { registerMetricsCommands } = await import('../commands/metrics')
      const { MetricsPanelProvider } = await import('../ui/metrics')
      const { store } = createMockMetricsStore()
      const panelProvider = new MetricsPanelProvider(store)
      const { client } = createMockDockerClient()

      const disposables = registerMetricsCommands(panelProvider, store, client)
      expect(disposables).toHaveLength(3)

      await h.commands.get('sentrydesk.startMetrics')!()
      expect(store.start).toHaveBeenCalled()
      await h.commands.get('sentrydesk.stopMetrics')!()
      expect(store.stop).toHaveBeenCalled()

      await h.commands.get('sentrydesk.viewMetrics')!({ containerId: 'abc123', containerName: 'nginx' })
      expect(panelProvider.currentContainerId).toBe('abc123')
      panelProvider.dispose()
    })

    it('compose commands register correctly', async () => {
      const { registerComposeCommands } = await import('../commands/compose')
      const { ComposePanelProvider } = await import('../ui/compose')

      const disposables = registerComposeCommands(new ComposePanelProvider())
      expect(disposables).toHaveLength(2)

      h.window.showInputBox.mockResolvedValueOnce('services:\n  db:\n    image: postgres:16\n')
      await h.commands.get('sentrydesk.parseCompose')!()
      expect(lastOpenedContent()).toContain('### db')
    })

    it('cleanup commands register and execute suggestions', async () => {
      const { registerCleanupCommands } = await import('../commands/cleanup')
      const { CleanupPanelProvider } = await import('../ui/cleanup')
      const engine = createMockCleanupEngine()
      const panelProvider = new CleanupPanelProvider(engine)
      const mock = createMockDockerClient()

      const disposables = registerCleanupCommands(panelProvider, engine, mock.client)
      expect(disposables).toHaveLength(4)

      const base = { title: 't', description: 'd', size: 0, actionable: true, action: 'a' }
      h.window.showWarningMessage.mockResolvedValue('Yes')

      await h.commands.get('sentrydesk.executeCleanup')!({ ...base, id: 'c', type: 'container', targetId: 'c1' })
      expect(mock.client.removeContainer).toHaveBeenCalledWith('c1', true)

      await h.commands.get('sentrydesk.executeCleanup')!({ ...base, id: 'i', type: 'image', targetId: 'sha256:1' })
      expect(mock.docker.getImage).toHaveBeenCalledWith('sha256:1')
      expect(mock.image.remove).toHaveBeenCalled()

      await h.commands.get('sentrydesk.executeCleanup')!({ ...base, id: 'v', type: 'volume', targetId: 'data' })
      expect(mock.docker.getVolume).toHaveBeenCalledWith('data')
      expect(mock.volume.remove).toHaveBeenCalled()

      await h.commands.get('sentrydesk.executeCleanup')!({ ...base, id: 'b', type: 'build-cache' })
      expect(h.terminal.sendText).toHaveBeenCalledWith('docker builder prune')

      await h.commands.get('sentrydesk.clearCleanup')!()
      expect(engine.clear).toHaveBeenCalled()
      h.window.showWarningMessage.mockReset()
    })

    it('dashboard command registers and summarises containers', async () => {
      const { registerDashboardCommands } = await import('../commands/dashboard')
      const { ContainerTreeProvider } = await import('../ui/tree')
      const { LogPanelProvider } = await import('../ui/logs')
      const { MetricsPanelProvider } = await import('../ui/metrics')
      const { ComposePanelProvider } = await import('../ui/compose')
      const { CleanupPanelProvider } = await import('../ui/cleanup')
      const { store } = createMockMetricsStore()
      const { client } = createMockDockerClient([sampleContainer])

      const disposables = registerDashboardCommands(
        {} as any,
        new ContainerTreeProvider(client, store),
        new LogPanelProvider(createMockLogStore()),
        new MetricsPanelProvider(store),
        new ComposePanelProvider(),
        new CleanupPanelProvider(createMockCleanupEngine()),
      )
      expect(disposables).toHaveLength(1)

      await h.commands.get('sentrydesk.openDashboard')!()
      expect(h.executeCommand).toHaveBeenCalledWith('sentrydesk.containers.focus')
      expect(lastOpenedContent()).toContain('Containers: 1 total, 1 running')
    })
  })

  describe('IPC bridge to @sentrydesk/core', () => {
    function createBridgeServices() {
      const mock = createMockDockerClient([sampleContainer])
      return {
        dockerClient: mock.client,
        metricsStore: createMockMetricsStore().store,
        logStore: createMockLogStore(),
        cleanupEngine: createMockCleanupEngine(),
      }
    }

    it('exposes the same channel names as the Electron main process', async () => {
      const { createCoreHandlers } = await import('../ipc/handlers')
      const handlers = createCoreHandlers(createBridgeServices())
      const channels = Object.keys(handlers)

      for (const channel of [
        'docker:connect',
        'docker:is-connected',
        'docker:get-containers',
        'docker:restart-container',
        'metrics:get',
        'logs:fetch',
        'logs:filter',
        'cleanup:analyze',
        'compose:parse',
      ]) {
        expect(channels).toContain(channel)
      }

      const electronMain = fs.readFileSync(path.resolve(__dirname, '../../../../electron/main.ts'), 'utf-8')
      for (const channel of channels) {
        expect(electronMain).toContain(`'${channel}'`)
      }
    })

    it('CoreBridge dispatches in-process and rejects unknown channels', async () => {
      const { CoreBridge, createCoreHandlers } = await import('../ipc/handlers')
      const services = createBridgeServices()
      const bridge = new CoreBridge(createCoreHandlers(services))

      expect(await bridge.invoke('docker:get-containers')).toEqual([sampleContainer])
      await bridge.invoke('docker:remove-container', 'abc', true)
      expect(services.dockerClient.removeContainer).toHaveBeenCalledWith('abc', true)
      await expect(bridge.invoke('nope:missing')).rejects.toThrow('Unknown IPC channel: nope:missing')
    })

    it('serves core calls over a local socket', async () => {
      const { CoreBridge, createCoreHandlers } = await import('../ipc/handlers')
      const { IpcServer, IpcSocketClient, defaultSocketPath } = await import('../ipc/server')
      const services = createBridgeServices()
      ;(services.dockerClient.restartContainer as any).mockRejectedValueOnce(new Error('boom'))
      const server = new IpcServer(
        new CoreBridge(createCoreHandlers(services)),
        defaultSocketPath(`sentrydesk-test-${process.pid}-${Date.now()}`),
      )
      await server.start()
      expect(server.isListening()).toBe(true)

      const client = new IpcSocketClient(server.socketPath)
      try {
        await client.connect()

        const containers = await client.invoke<ContainerInfo[]>('docker:get-containers')
        expect(containers[0].name).toBe('nginx')

        const parsed = await client.invoke<any>('compose:parse', 'services:\n  web:\n    image: nginx\n', 'demo')
        expect(parsed.config.name).toBe('demo')

        await expect(client.invoke('docker:restart-container', 'abc')).rejects.toThrow('boom')
        await expect(client.invoke('nope:missing')).rejects.toThrow('Unknown IPC channel')
      } finally {
        client.close()
        await server.stop()
      }
      expect(server.isListening()).toBe(false)
    })
  })

  describe('Extension activation', () => {
    it('registers every contributed command and exposes the core bridge', async () => {
      h.config.get.mockImplementation((key: string, defaultValue?: unknown) =>
        key === 'ipc.enabled' ? false : defaultValue,
      )
      const { activate, deactivate } = await import('../extension')
      const context = { subscriptions: [] as Array<{ dispose(): unknown }> }

      const api = await activate(context as any)

      expect(h.window.createTreeView).toHaveBeenCalledWith('sentrydesk.containers', expect.any(Object))
      expect([...h.commands.keys()].sort()).toEqual([...contributedCommands].sort())
      expect(api.socketPath).toBeNull()
      expect(typeof (await api.bridge.invoke('docker:is-connected'))).toBe('boolean')
      expect(api.bridge.has('compose:parse')).toBe(true)

      await deactivate()
      for (const d of context.subscriptions) d.dispose()
    })
  })
})
