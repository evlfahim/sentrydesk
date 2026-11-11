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
  private followInterval: ReturnType<typeof setInterval> | null = null

  constructor(logStore: LogStore) {
    this.logStore = logStore
  }

  get currentContainerId(): string | null {
    return this._currentContainerId
  }

  get currentContainerName(): string | null {
    return this._currentContainerName
  }

  async showLogs(containerId: string, containerName?: string) {
    this._currentContainerId = containerId
    this._currentContainerName = containerName || containerId.slice(0, 12)

    // Stop any existing follow interval
    this.stopFollow()

    // Fetch initial logs
    const logs = await this.logStore.fetchLogs(containerId, { tail: 500 })
    await this.render(this.formatLogs(logs))

    // Enable follow mode
    this.logStore.setFollowMode(containerId, true)
    this.startFollow()
  }

  /**
   * Re-render the panel with logs matching a search term.
   */
  async search(term: string) {
    if (!this._currentContainerId) return
    const logs = this.logStore.filterLogs(this._currentContainerId, { search: term })
    await this.render(this.formatLogs(logs))
  }

  private async render(content: string) {
    if (this.panel && this.panel.uri && !this.panel.isClosed) {
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
  }

  private formatLogs(logs: LogEntry[]): string {
    const header = `# Logs: ${this._currentContainerName || this._currentContainerId || 'unknown'}`
    if (logs.length === 0) {
      return `${header}\n\nNo log output.`
    }
    const lines = logs.map((entry) => {
      const timestamp = entry.timestamp ? `${entry.timestamp} ` : ''
      return `${timestamp}[${entry.stream}] ${entry.message}`
    })
    return [header, '', ...lines].join('\n')
  }

  private startFollow() {
    if (this.followInterval) return

    this.followInterval = setInterval(async () => {
      if (!this._currentContainerId) return
      if (!this.logStore.isFollowMode(this._currentContainerId)) return

      const logs = this.logStore.getLogs(this._currentContainerId)
      if (logs.length === 0 || !this.panel) return

      try {
        await this.render(this.formatLogs(logs))
      } catch {
        // Editor may have been closed between ticks
      }
    }, 2000)
    // Don't keep the extension host (or test runner) alive for this timer
    ;(this.followInterval as any).unref?.()
  }

  stopFollow() {
    if (this.followInterval) {
      clearInterval(this.followInterval)
      this.followInterval = null
    }
  }

  dispose() {
    this.stopFollow()
    if (this._currentContainerId) {
      this.logStore.setFollowMode(this._currentContainerId, false)
    }
  }
}
