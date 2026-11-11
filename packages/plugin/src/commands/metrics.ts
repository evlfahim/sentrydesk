/**
 * Metrics commands for the VS Code extension.
 *
 * Opens a read-only editor panel showing live CPU/RAM metrics.
 */

import * as vscode from 'vscode'
import { DockerClient, MetricsStore } from '@sentrydesk/core'
import { MetricsPanelProvider } from '../ui/metrics'
import { pickContainer } from './pick'

export function registerMetricsCommands(
  panelProvider: MetricsPanelProvider,
  metricsStore: MetricsStore,
  dockerClient: DockerClient = DockerClient.getInstance(),
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = []

  // View metrics
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.viewMetrics', async (node?: any) => {
      let target: { id: string; name: string } | undefined
      if (node && (node.containerId || node.id)) {
        const id: string = node.containerId || node.id
        target = { id, name: node.containerName || node.name || id.slice(0, 12) }
      } else {
        target = await pickContainer(dockerClient, 'Select a container to view metrics')
      }
      if (!target) return

      // Make sure collection is running so the panel fills in
      metricsStore.start()

      try {
        await panelProvider.showMetrics(target.id, target.name)
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to load metrics: ${err.message}`)
      }
    }),
  )

  // Start metrics collection
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.startMetrics', () => {
      metricsStore.start()
      vscode.window.showInformationMessage('Metrics collection started')
    }),
  )

  // Stop metrics collection
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.stopMetrics', () => {
      metricsStore.stop()
      vscode.window.showInformationMessage('Metrics collection stopped')
    }),
  )

  return disposables
}
