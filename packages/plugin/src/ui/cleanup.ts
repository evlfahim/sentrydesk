/**
 * Cleanup panel provider for the VS Code extension.
 *
 * Opens a read-only editor panel showing disk usage and cleanup suggestions.
 */

import * as vscode from 'vscode'
import { CleanupEngine, CleanupSuggestion } from '@sentrydesk/core'

export class CleanupPanelProvider {
  private cleanupEngine: CleanupEngine
  private panel: vscode.TextDocument | null = null

  constructor(cleanupEngine: CleanupEngine) {
    this.cleanupEngine = cleanupEngine
  }

  async showCleanup() {
    try {
      await this.cleanupEngine.analyze()
    } catch {
      // Analysis may fail if Docker is not connected — that's ok
    }
    await this.refresh()
  }

  async refresh() {
    const suggestions = this.cleanupEngine.getSuggestions()
    const totalSavings = this.cleanupEngine.getTotalSavings()
    const content = this.formatCleanup(suggestions, totalSavings)

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
        language: 'cleanup',
        content,
      })
      this.panel = doc
      await vscode.window.showTextDocument(doc, { preview: false })
    }
  }

  private formatCleanup(suggestions: CleanupSuggestion[], totalSavings: number): string {
    const lines: string[] = [
      '# Disk Cleanup Report',
      '',
      `Total potential savings: ${formatBytes(totalSavings)}`,
      '',
    ]

    if (suggestions.length === 0) {
      lines.push('No cleanup suggestions available. Your disk is clean!')
      return lines.join('\n')
    }

    // Group by type
    const byType = new Map<string, CleanupSuggestion[]>()
    for (const s of suggestions) {
      const arr = byType.get(s.type) || []
      arr.push(s)
      byType.set(s.type, arr)
    }

    for (const [type, items] of byType) {
      lines.push(`## ${formatType(type)} (${items.length} items, ${formatBytes(items.reduce((sum, s) => sum + s.size, 0))})`)
      lines.push('')

      for (const item of items) {
        const actionable = item.actionable ? '✅' : '❌'
        lines.push(`### ${actionable} ${item.title}`)
        lines.push(`- **Type:** ${type}`)
        lines.push(`- **Size:** ${formatBytes(item.size)}`)
        lines.push(`- **Description:** ${item.description}`)
        lines.push(`- **Action:** \`${item.action}\``)
        if (item.targetId) {
          lines.push(`- **Target ID:** \`${item.targetId}\``)
        }
        lines.push('')
      }
    }

    return lines.join('\n')
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function formatType(type: string): string {
  switch (type) {
    case 'image':
      return 'Unused Images'
    case 'volume':
      return 'Unused Volumes'
    case 'build-cache':
      return 'Build Cache'
    case 'container':
      return 'Stopped Containers'
    default:
      return type
  }
}
