/**
 * Container tree view provider for the VS Code extension.
 *
 * Displays running containers in the sidebar with status, CPU, and memory info.
 */

import * as vscode from 'vscode'
import { DockerClient, ContainerInfo, MetricsStore, MetricsEntry } from '@sentrydesk/core'

export class ContainerTreeProvider implements vscode.TreeDataProvider<ContainerTreeItem> {
  private dockerClient: DockerClient
  private metricsStore: MetricsStore
  private _onDidChangeTree: vscode.EventEmitter<ContainerTreeItem | ContainerTreeItem[] | ContainerTreeItem[] | void>
  private containers: ContainerInfo[] = []
  private metricsMap: Map<string, MetricsEntry> = new Map()
  private refreshInterval: NodeJS.Timeout | null = null

  constructor(dockerClient: DockerClient, metricsStore: MetricsStore) {
    this.dockerClient = dockerClient
    this.metricsStore = metricsStore
    this._onDidChangeTree = new vscode.EventEmitter<ContainerTreeItem | ContainerTreeItem[] | ContainerTreeItem[] | void>()

    // Subscribe to metrics updates
    this.metricsStore.addListener((entries: MetricsEntry[]) => {
      for (const entry of entries) {
        this.metricsMap.set(entry.containerId, entry)
      }
      this._onDidChangeTree.fire()
    })
  }

  get onDidChangeTree(): vscode.Event<ContainerTreeItem | ContainerTreeItem[] | ContainerTreeItem[] | void> {
    return this._onDidChangeTree.event
  }

  async refresh() {
    try {
      this.containers = await this.dockerClient.getContainers()
      this._onDidChangeTree.fire()
    } catch {
      this.containers = []
      this._onDidChangeTree.fire()
    }
  }

  getTreeItem(element: ContainerTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: ContainerTreeItem): Promise<ContainerTreeItem[]> {
    if (element) {
      // Children of a container (not implemented — flat list)
      return []
    }

    if (this.containers.length === 0) {
      return [
        new ContainerTreeItem({
          label: 'No containers found',
          description: 'Connect to Docker to see containers',
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          iconPath: new vscode.ThemeIcon('info'),
        }),
      ]
    }

    return this.containers.map((c) => {
      const metric = this.metricsMap.get(c.id)
      const cpuPercent = metric ? metric.cpuPercent : 0
      const memPercent = metric ? metric.memoryPercent : 0
      const memUsage = metric ? metric.memoryUsage : 0

      const statusColor = c.state === 'running' ? 'green' : 'red'
      const statusIcon = c.state === 'running' ? 'play' : 'stop'

      return new ContainerTreeItem({
        label: c.name,
        description: `${c.state} | CPU: ${cpuPercent.toFixed(1)}% | MEM: ${memPercent.toFixed(1)}%`,
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        iconPath: new vscode.ThemeIcon(statusIcon, new vscode.ThemeColor(`charts.${statusColor}`)),
        containerId: c.id,
        containerName: c.name,
        state: c.state,
        cpuPercent,
        memoryPercent: memPercent,
        memoryUsage: memUsage,
      })
    })
  }
}

export class ContainerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description?: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeColor,
    public readonly containerId?: string,
    public readonly containerName?: string,
    public readonly state?: string,
    public readonly cpuPercent?: number,
    public readonly memoryPercent?: number,
    public readonly memoryUsage?: number,
  ) {
    super(label, collapsibleState)
    this.tooltip = this.formatTooltip()
    this.contextValue = 'container'
  }

  private formatTooltip(): string {
    let text = this.label
    if (this.description) {
      text += `\n${this.description}`
    }
    if (this.containerId) {
      text += `\nID: ${this.containerId}`
    }
    return text
  }
}
