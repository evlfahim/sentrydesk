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
  private refreshInterval: NodeJS.Timeout | null = null

  constructor(metricsStore: MetricsStore) {
    this.metricsStore = metricsStore
  }

  get currentContainerId(): string | null {
    return this._currentContainerId
  }

  async showMetrics(containerId: string, containerName: string) {
    this._currentContainerId = containerId
    this._currentContainerName = containerName

    // Stop any existing refresh interval
    this.stopRefresh()

    // Fetch current metrics
    const metrics = await this.getMetricsSnapshot()
    const content = this.formatMetrics(metrics)

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
        language: 'metrics',
        content,
      })
      this.panel = doc
      await vscode.window.showTextDocument(doc, { preview: false })
    }

    // Start periodic refresh
    this.startRefresh()
  }

  private async getMetricsSnapshot(): Promise<MetricsEntry[]> {
    try {
      return await this.metricsStore.getMetrics()
    } catch {
      return []
    }
  }

  private formatMetrics(entries: MetricsEntry[]): string {
    if (entries.length === 0) {
      return 'No metrics available. Start metrics collection first.'
    }

    const lines: string[] = [
      `# Metrics for ${this.currentContainerName || this.currentContainerId || 'unknown'}`,
      `Collected at: ${new Date().toISOString()}`,
      '',
      '| Container | CPU % | Memory Usage | Memory Limit | Memory % |',
      '|-----------|-------|-------------|--------------|----------|',
    ]

    for (const entry of entries) {
      const memUsageMB = (entry.memoryUsage / 1024 / 1024).toFixed(2)
      const memLimitMB = (entry.memoryLimit / 1024 / 1024).toFixed(2)
      lines.push(
        `| ${entry.containerName || entry.containerId.slice(0, 8)} | ${entry.cpuPercent.toFixed(2)}% | ${memUsageMB} MB | ${memLimitMB} MB | ${entry.memoryPercent.toFixed(2)}% |`,
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
      if (!this._currentContainerId) return

      const metrics = await this.getMetricsSnapshot()
      const content = this.formatMetrics(metrics)
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

  private stopRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = null
    }
  }
}
