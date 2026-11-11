/**
 * SentryDesk VS Code Extension
 *
 * Main entry point that activates the extension, registers commands,
 * tree views, and panels.  All Docker operations delegate to the
 * shared @sentrydesk/core package, which is also exposed over a local
 * IPC server using the same channel names as the Electron desktop app.
 */

import * as vscode from 'vscode'
import { DockerClient, MetricsStore, LogStore, CleanupEngine } from '@sentrydesk/core'
import { registerDockerCommands } from './commands/docker'
import { registerLogCommands } from './commands/logs'
import { registerMetricsCommands } from './commands/metrics'
import { registerComposeCommands } from './commands/compose'
import { registerCleanupCommands } from './commands/cleanup'
import { registerDashboardCommands } from './commands/dashboard'
import { ContainerTreeProvider } from './ui/tree'
import { LogPanelProvider } from './ui/logs'
import { MetricsPanelProvider } from './ui/metrics'
import { ComposePanelProvider } from './ui/compose'
import { CleanupPanelProvider } from './ui/cleanup'
import { CoreBridge, createCoreHandlers } from './ipc/handlers'
import { IpcServer, defaultSocketPath } from './ipc/server'

export interface SentryDeskApi {
  bridge: CoreBridge
  socketPath: string | null
}

let metricsStore: MetricsStore | undefined
let ipcServer: IpcServer | undefined

/**
 * Activates the extension when first command or view is used.
 */
export async function activate(context: vscode.ExtensionContext): Promise<SentryDeskApi> {
  // Shared core instances
  const dockerClient = DockerClient.getInstance()
  metricsStore = MetricsStore.getInstance()
  const logStore = LogStore.getInstance()
  const cleanupEngine = CleanupEngine.getInstance()

  // UI providers
  const containerTreeProvider = new ContainerTreeProvider(dockerClient, metricsStore)
  const logPanelProvider = new LogPanelProvider(logStore)
  const metricsPanelProvider = new MetricsPanelProvider(metricsStore)
  const composePanelProvider = new ComposePanelProvider()
  const cleanupPanelProvider = new CleanupPanelProvider(cleanupEngine)

  const containerView = vscode.window.createTreeView('sentrydesk.containers', {
    treeDataProvider: containerTreeProvider,
  })
  context.subscriptions.push(containerView)
  context.subscriptions.push(
    { dispose: () => containerTreeProvider.dispose() },
    { dispose: () => logPanelProvider.dispose() },
    { dispose: () => metricsPanelProvider.dispose() },
  )

  // Commands
  context.subscriptions.push(
    ...registerDockerCommands(dockerClient, containerTreeProvider, metricsStore),
    ...registerLogCommands(logPanelProvider, logStore, dockerClient),
    ...registerMetricsCommands(metricsPanelProvider, metricsStore, dockerClient),
    ...registerComposeCommands(composePanelProvider),
    ...registerCleanupCommands(cleanupPanelProvider, cleanupEngine, dockerClient),
    ...registerDashboardCommands(
      context,
      containerTreeProvider,
      logPanelProvider,
      metricsPanelProvider,
      composePanelProvider,
      cleanupPanelProvider,
    ),
  )

  // IPC bridge to @sentrydesk/core
  const bridge = new CoreBridge(createCoreHandlers({ dockerClient, metricsStore, logStore, cleanupEngine }))
  let socketPath: string | null = null
  const output = vscode.window.createOutputChannel('SentryDesk')
  context.subscriptions.push(output)

  const ipcEnabled = vscode.workspace.getConfiguration('sentrydesk').get<boolean>('ipc.enabled', true)
  if (ipcEnabled) {
    ipcServer = new IpcServer(bridge, defaultSocketPath(`sentrydesk-vscode-${process.pid}`))
    try {
      await ipcServer.start()
      socketPath = ipcServer.socketPath
      output.appendLine(`IPC server listening on ${socketPath}`)
    } catch (err: any) {
      output.appendLine(`IPC server failed to start: ${err?.message || String(err)}`)
      ipcServer = undefined
    }
  }

  // Auto-connect if the Docker daemon is reachable; the user can connect manually otherwise
  dockerClient
    .connect()
    .then(() => {
      metricsStore?.start()
      return containerTreeProvider.refresh()
    })
    .catch((err: any) => {
      output.appendLine(`Docker auto-connect failed: ${err?.message || String(err)}`)
    })

  return { bridge, socketPath }
}

/**
 * Deactivates the extension.
 */
export async function deactivate(): Promise<void> {
  metricsStore?.stop()
  if (ipcServer) {
    await ipcServer.stop()
    ipcServer = undefined
  }
}
