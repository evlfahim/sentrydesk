/**
 * Log viewer commands for the VS Code extension.
 *
 * Opens a read-only editor panel showing container logs with follow mode and search.
 */

import * as vscode from 'vscode'
import { DockerClient, LogStore } from '@sentrydesk/core'
import { LogPanelProvider } from '../ui/logs'
import { pickContainer } from './pick'

export function registerLogCommands(
  panelProvider: LogPanelProvider,
  logStore: LogStore,
  dockerClient: DockerClient = DockerClient.getInstance(),
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = []

  // View logs for a container
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.viewLogs', async (node?: any) => {
      let target: { id: string; name: string } | undefined
      if (node && (node.containerId || node.id)) {
        const id: string = node.containerId || node.id
        target = { id, name: node.containerName || node.name || id.slice(0, 12) }
      } else {
        target = await pickContainer(dockerClient, 'Select a container to view logs')
      }
      if (!target) return

      try {
        await panelProvider.showLogs(target.id, target.name)
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to load logs: ${err.message}`)
      }
    }),
  )

  // Search the current log view
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.searchLogs', async () => {
      if (!panelProvider.currentContainerId) {
        vscode.window.showWarningMessage('Open container logs first.')
        return
      }
      const term = await vscode.window.showInputBox({
        prompt: 'Search logs (leave empty to show all)',
        placeHolder: 'error',
      })
      if (term === undefined) return

      // Pause follow mode while a search is shown so it isn't overwritten
      if (term.length > 0) {
        logStore.setFollowMode(panelProvider.currentContainerId, false)
      }
      await panelProvider.search(term)
    }),
  )

  // Follow mode toggle
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.toggleFollow', async () => {
      const containerId = panelProvider.currentContainerId
      if (!containerId) return

      const current = logStore.isFollowMode(containerId)
      logStore.setFollowMode(containerId, !current)
      vscode.window.showInformationMessage(`Log follow mode ${!current ? 'enabled' : 'disabled'}`)
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
