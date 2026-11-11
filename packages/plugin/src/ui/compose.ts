/**
 * Compose panel provider for the VS Code extension.
 *
 * Opens a read-only editor panel showing parsed Docker Compose YAML.
 */

import * as vscode from 'vscode'
import { parseComposeFile, ComposeFile } from '@sentrydesk/core'

export class ComposePanelProvider {
  private panel: vscode.TextDocument | null = null
  private lastResult: ComposeFile | null = null

  get currentResult(): ComposeFile | null {
    return this.lastResult
  }

  async showCompose() {
    // Try to find a compose file in the workspace
    const files = await vscode.workspace.findFiles(
      '**/{docker-compose,compose}*.{yml,yaml}',
      '**/node_modules/**',
    )
    let composeFile: vscode.Uri | undefined

    if (files.length === 1) {
      composeFile = files[0]
    } else if (files.length > 1) {
      const picked = await vscode.window.showQuickPick(
        files.map((uri) => ({ label: vscode.workspace.asRelativePath(uri), uri })),
        { placeHolder: 'Select a Docker Compose file' },
      )
      if (!picked) return
      composeFile = picked.uri
    } else {
      // Prompt user to select a file
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'YAML files': ['yml', 'yaml'] },
        title: 'Select a Docker Compose file',
      })
      if (!selected || selected.length === 0) return
      composeFile = selected[0]
    }

    let text: string
    try {
      const content = await vscode.workspace.fs.readFile(composeFile)
      text = new TextDecoder().decode(content)
    } catch (err: any) {
      throw new Error(`Failed to read compose file: ${err.message}`)
    }
    await this.parseContent(text, undefined, composeFile.fsPath)
  }

  async parseContent(content: string, projectName?: string, filePath?: string): Promise<ComposeFile> {
    const result = parseComposeFile(content, projectName)
    if (filePath) {
      result.path = filePath
    }
    this.lastResult = result

    const formatted = this.formatComposeResult(result)

    if (this.panel && this.panel.uri && !this.panel.isClosed) {
      const edit = new vscode.WorkspaceEdit()
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(this.panel.lineCount, 0),
      )
      edit.replace(this.panel.uri, fullRange, formatted)
      await vscode.workspace.applyEdit(edit)
    } else {
      const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: formatted,
      })
      this.panel = doc
      await vscode.window.showTextDocument(doc, { preview: false })
    }

    return result
  }

  private formatComposeResult(result: ComposeFile): string {
    const lines: string[] = [
      `# Compose File: ${result.path || 'inline'}`,
      `# Project: ${result.config?.name || 'unnamed'}`,
      '',
    ]

    if (result.errors.length > 0) {
      lines.push('## Validation')
      lines.push('')
      for (const error of result.errors) {
        const severity = error.severity === 'error' ? 'ERROR' : 'WARNING'
        lines.push(`- ${severity} ${error.path}: ${error.message}`)
      }
      lines.push('')
    } else {
      lines.push('Validation: OK')
      lines.push('')
    }

    if (result.config) {
      lines.push('## Services')
      lines.push('')
      if (result.config.services.length > 0) {
        for (const service of result.config.services) {
          lines.push(`### ${service.name}`)
          if (service.image) {
            lines.push(`- Image: \`${service.image}\``)
          }
          if (service.build) {
            if (typeof service.build === 'string') {
              lines.push(`- Build: \`${service.build}\``)
            } else {
              lines.push(`- Build context: \`${service.build.context}\``)
              if (service.build.dockerfile) {
                lines.push(`- Dockerfile: \`${service.build.dockerfile}\``)
              }
            }
          }
          if (service.ports && service.ports.length > 0) {
            lines.push(`- Ports: ${service.ports.map((p) => `${p.host}:${p.container}`).join(', ')}`)
          }
          if (service.environment && Object.keys(service.environment).length > 0) {
            lines.push(`- Environment: ${Object.keys(service.environment).join(', ')}`)
          }
          if (service.volumes && service.volumes.length > 0) {
            lines.push(`- Volumes: ${service.volumes.join(', ')}`)
          }
          if (service.dependsOn && service.dependsOn.length > 0) {
            lines.push(`- Depends on: ${service.dependsOn.join(', ')}`)
          }
          if (service.restart) {
            lines.push(`- Restart: \`${service.restart}\``)
          }
          lines.push('')
        }
      } else {
        lines.push('No services defined.')
        lines.push('')
      }

      if (result.config.networks.length > 0) {
        lines.push('## Networks')
        lines.push('')
        for (const network of result.config.networks) {
          lines.push(`- ${network.name}${network.driver ? ` (driver: ${network.driver})` : ''}`)
        }
        lines.push('')
      }

      if (result.config.volumes.length > 0) {
        lines.push('## Volumes')
        lines.push('')
        for (const volume of result.config.volumes) {
          lines.push(`- ${volume.name}${volume.driver ? ` (driver: ${volume.driver})` : ''}`)
        }
        lines.push('')
      }
    }

    lines.push('---')
    lines.push('Original YAML:')
    lines.push('')
    lines.push('```yaml')
    lines.push(result.content)
    lines.push('```')

    return lines.join('\n')
  }
}
