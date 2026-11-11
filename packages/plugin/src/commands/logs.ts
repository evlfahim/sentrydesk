/**
 * Log viewer commands for the VS Code extension.
 *
 * Opens a read-only editor panel showing container logs with follow mode.
 */

import * as vscode from 'vscode'
import { LogStore, LogEntry } from '@sentrydesk/core'
import { LogPanelProvider } from '../ui/logs'

export function registerLogCommands(
  panelProvider: LogPanelProvider,
  logStore: LogStore,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = []

  // View logs for a container
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.viewLogs', async (node?: any) => {
      let containerId: string | undefined
      let containerName: string | undefined

      if (node) {
        containerId = node.containerId || node.id
        containerName = node.containerName || node.name
      }

      if (!containerId) {
        // Prompt user to select a container
        const containers = await logStore.getContainerNames()
        if (containers.length === 0) {
          vscode.window.showWarningMessage('No containers available. Connect to Docker first.')
          return
        }
        const selected = await vscode.window.showQuickPick(containers, {
          placeHolder: 'Select a container to view logs',
        })
        if (!selected) return
        containerId = selected
        containerName = selected
      }

      try {
        await panelProvider.showLogs(containerId, containerName)
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to load logs: ${err.message}`)
      }
    }),
  )

  // Follow mode toggle
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.toggleFollow', async () => {
      const containerId = panelProvider.currentContainerId
      if (!containerId) return

      const current = logStore.isFollowMode(containerId)
      logStore.setFollowMode(containerId, !current)
      vscode.window.showInformationMessage(
        `Log follow mode ${!current ? 'enabled' : 'disabled'}`,
      )
    }),
  )

  // Clear logs
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.clearLogs', async () => {
      const containerId = panelProvider.currentContainerId
      if (!containerId) return

      logStore.clearLogs(containerId)
      vscode.window.showInformationMessage('Logs cleared')
    }),
  )

  return disposables
}
