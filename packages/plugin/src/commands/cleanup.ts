/**
 * Disk cleanup commands for the VS Code extension.
 *
 * Opens a read-only editor panel showing disk usage and cleanup suggestions,
 * and executes individual suggestions against the Docker daemon.
 */

import * as vscode from 'vscode'
import { CleanupEngine, CleanupSuggestion, DockerClient } from '@sentrydesk/core'
import { CleanupPanelProvider, formatBytes } from '../ui/cleanup'

export function registerCleanupCommands(
  panelProvider: CleanupPanelProvider,
  cleanupEngine: CleanupEngine,
  dockerClient: DockerClient = DockerClient.getInstance(),
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = []

  // View cleanup
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.viewCleanup', async () => {
      try {
        await panelProvider.showCleanup()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to load cleanup data: ${err.message}`)
      }
    }),
  )

  // Run cleanup analysis
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.analyzeCleanup', async () => {
      try {
        await cleanupEngine.analyze()
        await panelProvider.refresh()
        const suggestions = cleanupEngine.getSuggestions()
        const totalSavings = cleanupEngine.getTotalSavings()
        vscode.window.showInformationMessage(
          `Analysis complete: ${suggestions.length} suggestions, ${formatBytes(totalSavings)} potential savings`,
        )
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to analyze disk: ${err.message}`)
      }
    }),
  )

  // Execute cleanup suggestion
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.executeCleanup', async (suggestion?: CleanupSuggestion) => {
      if (!suggestion) {
        const suggestions = cleanupEngine.getSuggestions().filter((s) => s.actionable)
        if (suggestions.length === 0) {
          vscode.window.showInformationMessage('No cleanup suggestions available. Run "SentryDesk: Analyze Disk Usage" first.')
          return
        }
        const selected = await vscode.window.showQuickPick(
          suggestions.map((s) => ({
            label: `${s.title} (${formatBytes(s.size)})`,
            description: s.description,
            detail: s.action,
            suggestion: s,
          })),
          { placeHolder: 'Select a cleanup action' },
        )
        if (!selected) return
        suggestion = selected.suggestion
      }

      const confirmed = await vscode.window.showWarningMessage(
        `Execute: ${suggestion.title} (${formatBytes(suggestion.size)})?`,
        { modal: true },
        'Yes',
      )
      if (confirmed !== 'Yes') return

      try {
        await executeSuggestion(suggestion, dockerClient)
        vscode.window.showInformationMessage(`Cleanup executed: ${suggestion.title}`)
        await cleanupEngine.analyze()
        await panelProvider.refresh()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to execute cleanup: ${err.message}`)
      }
    }),
  )

  // Clear all cleanup suggestions
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.clearCleanup', () => {
      cleanupEngine.clear()
      vscode.window.showInformationMessage('Cleanup suggestions cleared')
    }),
  )

  return disposables
}

/**
 * Apply one cleanup suggestion through the Docker daemon.
 */
export async function executeSuggestion(suggestion: CleanupSuggestion, dockerClient: DockerClient): Promise<void> {
  if (suggestion.type === 'build-cache') {
    // Dockerode has no builder-prune API; hand off to the docker CLI so the
    // user sees and confirms the prune
    const terminal = vscode.window.createTerminal('SentryDesk Cleanup')
    terminal.show()
    terminal.sendText('docker builder prune')
    return
  }

  const docker = dockerClient.getDocker()
  if (!dockerClient.isConnected() || !docker) {
    throw new Error('Docker client not connected')
  }
  if (!suggestion.targetId) {
    throw new Error('Suggestion has no target')
  }

  switch (suggestion.type) {
    case 'container':
      await dockerClient.removeContainer(suggestion.targetId, true)
      break
    case 'image':
      await docker.getImage(suggestion.targetId).remove()
      break
    case 'volume':
      await docker.getVolume(suggestion.targetId).remove()
      break
  }
}
