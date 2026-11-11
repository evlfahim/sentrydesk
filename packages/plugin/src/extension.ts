/**
 * SentryDesk VS Code Extension
 *
 * Main entry point that activates the extension, registers commands,
 * tree views, and panels.  All Docker operations delegate to the
 * shared @sentrydesk/core package.
 */

import * as vscode from 'vscode'
import {
  DockerClient,
  MetricsStore,
  LogStore,
  CleanupEngine,
} from '@sentrydesk/core'
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

let dockerClient: DockerClient
let metricsStore: MetricsStore
let logStore: LogStore
let cleanupEngine: CleanupEngine
let containerTreeProvider: ContainerTreeProvider
let logPanelProvider: LogPanelProvider
let metricsPanelProvider: MetricsPanelProvider
let composePanelProvider: ComposePanelProvider
let cleanupPanelProvider: CleanupPanelProvider

/**
 * Activates the extension when first command is invoked.
 */
export function activate(context: vscode.ExtensionContext) {
  // Initialise shared core instances
  dockerClient = DockerClient.getInstance()
  metricsStore = MetricsStore.getInstance()
  logStore = LogStore.getInstance()
  cleanupEngine = CleanupEngine.getInstance()

  // Register UI providers
  containerTreeProvider = new ContainerTreeProvider(dockerClient, metricsStore)
  logPanelProvider = new LogPanelProvider(logStore)
  metricsPanelProvider = new MetricsPanelProvider(metricsStore)
  composePanelProvider = new ComposePanelProvider()
  cleanupPanelProvider = new CleanupPanelProvider(cleanupEngine)

  // Register tree view
  const containerView = vscode.window.createTreeView('sentrydesk.containers', {
    treeDataProvider: containerTreeProvider,
  })
  context.subscriptions.push(containerView)

  // Register commands
  const disposables: vscode.Disposable[] = []

  disposables.push(...registerDockerCommands(dockerClient, containerTreeProvider))
  disposables.push(...registerLogCommands(logPanelProvider, logStore))
  disposables.push(...registerMetricsCommands(metricsPanelProvider, metricsStore))
  disposables.push(...registerComposeCommands(composePanelProvider))
  disposables.push(...registerCleanupCommands(cleanupPanelProvider, cleanupEngine))
  disposables.push(...registerDashboardCommands(context, containerTreeProvider, logPanelProvider, metricsPanelProvider, composePanelProvider, cleanupPanelProvider))

  context.subscriptions.push(...disposables)

  // Auto-connect on activation if Docker socket is available
  try {
    dockerClient.connect().catch(() => {
      // Silently fail — user can connect manually
    })
  } catch {
    // Docker not available yet
  }

  vscode.window.showInformationMessage('SentryDesk extension activated')
}

/**
 * Deactivates the extension.
 */
export function deactivate() {
  metricsStore.stop()
}
