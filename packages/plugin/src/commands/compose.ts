/**
 * Compose file viewer commands for the VS Code extension.
 *
 * Opens a read-only editor panel showing parsed Docker Compose YAML.
 */

import * as vscode from 'vscode'
import { ComposePanelProvider } from '../ui/compose'

export function registerComposeCommands(
  panelProvider: ComposePanelProvider,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = []

  // View compose file
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.viewCompose', async () => {
      try {
        await panelProvider.showCompose()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to load compose file: ${err.message}`)
      }
    }),
  )

  // Parse compose content
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.parseCompose', async () => {
      const input = await vscode.window.showInputBox({
        placeHolder: 'Paste Docker Compose YAML content',
        prompt: 'Enter or paste your Docker Compose YAML',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Compose content cannot be empty'
          }
          return null
        },
      })
      if (!input) return

      try {
        await panelProvider.parseContent(input)
        vscode.window.showInformationMessage('Compose file parsed successfully')
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to parse compose: ${err.message}`)
      }
    }),
  )

  return disposables
}
