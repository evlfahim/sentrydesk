/**
 * Log panel provider for the VS Code extension.
 *
 * Opens a read-only editor panel showing container logs with follow mode support.
 */

import * as vscode from 'vscode'
import { LogStore, LogEntry } from '@sentrydesk/core'

export class LogPanelProvider {
  private logStore: LogStore
  private panel: vscode.TextDocument | null = null
  private _currentContainerId: string | null = null
  private _currentContainerName: string | null = null
  private followInterval: NodeJS.Timeout | null = null

  constructor(logStore: LogStore) {
    this.logStore = logStore
  }

  get currentContainerId(): string | null {
    return this._currentContainerId
  }

  async showLogs(containerId: string, containerName: string) {
    this._currentContainerId = containerId
    this._currentContainerName = containerName

    // Stop any existing follow interval
    this.stopFollow()

    // Fetch initial logs
    const logs = await this.logStore.fetchLogs(containerId, { tail: 500 })
    const content = this.formatLogs(logs)

    // Create or update the document
    if (this.panel && this.panel.uri) {
      const edit = new vscode.WorkspaceEdit()
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(this.panel.lineCount, 0),
      )
      edit.replace(this.panel.uri, fullRange, content)
      await vscode.workspace.applyEdit(edit)
    } else {
      const doc = await vscode.workspace.openTextDocument({
        language: 'log',
        content,
      })
      this.panel = doc
      await vscode.window.showTextDocument(doc, { preview: false })
    }

    // Enable follow mode
    this.logStore.setFollowMode(containerId, true)
    this.startFollow()
  }

  private formatLogs(logs: LogEntry[]): string {
    return logs
      .map((entry) => {
        const timestamp = entry.timestamp ? new Date(entry.timestamp).toISOString() : ''
        const stream = entry.stream ? `[${entry.stream}] ` : ''
        return `${timestamp} ${stream}${entry.message}`
      })
      .join('\n')
  }

  private startFollow() {
    if (this.followInterval) return

    this.followInterval = setInterval(async () => {
      if (!this._currentContainerId) return

      const isFollow = this.logStore.isFollowMode(this._currentContainerId)
      if (!isFollow) return

      const logs = await this.logStore.getLogs(this._currentContainerId)
      if (logs.length === 0) return

      const content = this.formatLogs(logs)
      if (this.panel) {
        const edit = new vscode.WorkspaceEdit()
        const fullRange = new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(this.panel.lineCount, 0),
        )
        edit.replace(this.panel.uri, fullRange, content)
        await vscode.workspace.applyEdit(edit)
      }
    }, 2000)
  }

  private stopFollow() {
    if (this.followInterval) {
      clearInterval(this.followInterval)
      this.followInterval = null
    }
  }
}
