/**
 * Dashboard commands for the VS Code extension.
 *
 * Provides the "Open Dashboard" command that opens a combined view
 * of all SentryDesk features in a single editor tab.
 */

import * as vscode from 'vscode'
import { ContainerTreeProvider } from '../ui/tree'
import { LogPanelProvider } from '../ui/logs'
import { MetricsPanelProvider } from '../ui/metrics'
import { ComposePanelProvider } from '../ui/compose'
import { CleanupPanelProvider } from '../ui/cleanup'

export function registerDashboardCommands(
  _context: vscode.ExtensionContext,
  treeProvider: ContainerTreeProvider,
  _logPanelProvider: LogPanelProvider,
  _metricsPanelProvider: MetricsPanelProvider,
  _composePanelProvider: ComposePanelProvider,
  _cleanupPanelProvider: CleanupPanelProvider,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = []

  // Open dashboard
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.openDashboard', async () => {
      // Open the containers tree view
      await vscode.commands.executeCommand('sentrydesk.containers.focus')

      await treeProvider.refresh()
      const containers = treeProvider.getContainers()
      const running = containers.filter((c) => c.state === 'running').length

      // Open a new tab showing a summary
      const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: [
          '# SentryDesk Dashboard',
          '',
          `Containers: ${containers.length} total, ${running} running`,
          '',
          ...containers.map((c) => `- **${c.name}** (${c.image}) — ${c.state}, ${c.status}`),
          '',
          '## Quick Actions',
          '',
          '- **Connect to Docker**: `SentryDesk: Connect to Docker`',
          '- **View Containers**: Open the Containers view in the sidebar',
          '- **View Logs**: Right-click a container → "SentryDesk: View Container Logs"',
          '- **View Metrics**: Right-click a container → "SentryDesk: View Container Metrics"',
          '- **View Compose**: `SentryDesk: View Compose File`',
          '- **View Cleanup**: `SentryDesk: View Disk Cleanup`',
          '',
          '## Container Tree',
          '',
          'Use the Containers view in the sidebar to browse and manage containers.',
          '',
          '## Metrics',
          '',
          'Metrics are collected every 2 seconds. Use `SentryDesk: Start Metrics Collection` to begin collection.',
          '',
          '## Logs',
          '',
          'Log viewer supports follow mode, search, and filtering.',
          '',
          '## Compose',
          '',
          'View and validate Docker Compose YAML files.',
          '',
          '## Disk Cleanup',
          '',
          'Analyze disk usage and execute cleanup suggestions.',
        ].join('\n'),
      })
      await vscode.window.showTextDocument(doc, { preview: true })
    }),
  )

  return disposables
}
