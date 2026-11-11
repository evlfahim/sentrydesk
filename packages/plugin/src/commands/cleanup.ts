/**
 * Disk cleanup commands for the VS Code extension.
 *
 * Opens a read-only editor panel showing disk usage and cleanup suggestions.
 */

import * as vscode from 'vscode'
import { CleanupEngine, CleanupSuggestion } from '@sentrydesk/core'
import { CleanupPanelProvider } from '../ui/cleanup'

export function registerCleanupCommands(
  panelProvider: CleanupPanelProvider,
  cleanupEngine: CleanupEngine,
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
        const suggestions = cleanupEngine.getSuggestions()
        if (suggestions.length === 0) {
          vscode.window.showInformationMessage('No cleanup suggestions available')
          return
        }
        const items = suggestions.map((s) => ({
          label: `${s.title} (${formatBytes(s.size)})`,
          description: s.description,
          detail: s.action,
          suggestion: s,
        }))
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a cleanup action',
        })
        if (!selected) return
        suggestion = selected.suggestion
      }

      if (!suggestion) return

      const confirmed = await vscode.window.showWarningMessage(
        `Execute: ${suggestion.title} (${formatBytes(suggestion.size)})?`,
        { modal: true },
        'Yes',
        'No',
      )
      if (confirmed !== 'Yes') return

      try {
        await cleanupEngine.execute(suggestion)
        vscode.window.showInformationMessage(`Cleanup executed: ${suggestion.title}`)
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
