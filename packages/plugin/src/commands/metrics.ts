/**
 * Metrics commands for the VS Code extension.
 *
 * Opens a read-only editor panel showing live CPU/RAM metrics.
 */

import * as vscode from 'vscode'
import { MetricsStore } from '@sentrydesk/core'
import { MetricsPanelProvider } from '../ui/metrics'

export function registerMetricsCommands(
  panelProvider: MetricsPanelProvider,
  metricsStore: MetricsStore,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = []

  // View metrics
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.viewMetrics', async (node?: any) => {
      let containerId: string | undefined
      let containerName: string | undefined

      if (node) {
        containerId = node.containerId || node.id
        containerName = node.containerName || node.name
      }

      if (!containerId) {
        const containers = await metricsStore.getContainerNames()
        if (containers.length === 0) {
          vscode.window.showWarningMessage('No containers available. Connect to Docker first.')
          return
        }
        const selected = await vscode.window.showQuickPick(containers, {
          placeHolder: 'Select a container to view metrics',
        })
        if (!selected) return
        containerId = selected
        containerName = selected
      }

      try {
        await panelProvider.showMetrics(containerId, containerName)
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
