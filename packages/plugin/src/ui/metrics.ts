/**
 * Metrics panel provider for the VS Code extension.
 *
 * Opens a read-only editor panel showing live CPU/RAM metrics.
 */

import * as vscode from 'vscode'
import { MetricsStore, MetricsEntry } from '@sentrydesk/core'

export class MetricsPanelProvider {
  private metricsStore: MetricsStore
  private panel: vscode.TextDocument | null = null
  private _currentContainerId: string | null = null
  private _currentContainerName: string | null = null
  private refreshInterval: ReturnType<typeof setInterval> | null = null

  constructor(metricsStore: MetricsStore) {
    this.metricsStore = metricsStore
  }

  get currentContainerId(): string | null {
    return this._currentContainerId
  }

  get currentContainerName(): string | null {
    return this._currentContainerName
  }

  async showMetrics(containerId: string, containerName?: string) {
    this._currentContainerId = containerId
    this._currentContainerName = containerName || containerId.slice(0, 12)

    // Stop any existing refresh interval
    this.stopRefresh()

    await this.render(this.formatMetrics(this.getMetricsSnapshot()))

    // Start periodic refresh
    this.startRefresh()
  }

  private getMetricsSnapshot(): MetricsEntry[] {
    if (!this._currentContainerId) return []
    try {
      return this.metricsStore.getMetrics(this._currentContainerId)
    } catch {
      return []
    }
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
        language: 'markdown',
        content,
      })
      this.panel = doc
      await vscode.window.showTextDocument(doc, { preview: false })
    }
  }

  private formatMetrics(entries: MetricsEntry[]): string {
    const title = `# Metrics for ${this._currentContainerName || this._currentContainerId || 'unknown'}`

    if (entries.length === 0) {
      return `${title}\n\nNo metrics available yet. Run "SentryDesk: Start Metrics Collection" and wait a few seconds.`
    }

    const lines: string[] = [
      title,
      `Collected at: ${new Date().toISOString()}`,
      '',
      '| Time | CPU % | Memory Usage | Memory Limit | Memory % |',
      '|------|-------|--------------|--------------|----------|',
    ]

    for (const entry of entries) {
      const memUsageMB = (entry.memoryUsage / 1024 / 1024).toFixed(2)
      const memLimitMB = (entry.memoryLimit / 1024 / 1024).toFixed(2)
      const time = new Date(entry.timestamp).toISOString().slice(11, 19)
      lines.push(
        `| ${time} | ${entry.cpuPercent.toFixed(2)}% | ${memUsageMB} MB | ${memLimitMB} MB | ${entry.memoryPercent.toFixed(2)}% |`,
      )
    }

    lines.push('')
    lines.push('---')
    lines.push('Metrics are collected every 2 seconds.')

    return lines.join('\n')
  }

  private startRefresh() {
    if (this.refreshInterval) return

    this.refreshInterval = setInterval(async () => {
      if (!this._currentContainerId || !this.panel) return
      try {
        await this.render(this.formatMetrics(this.getMetricsSnapshot()))
      } catch {
        // Editor may have been closed between ticks
      }
    }, 2000)
    // Don't keep the extension host (or test runner) alive for this timer
    ;(this.refreshInterval as any).unref?.()
  }

  stopRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = null
    }
  }

  dispose() {
    this.stopRefresh()
  }
}
