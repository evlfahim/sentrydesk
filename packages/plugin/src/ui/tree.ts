/**
 * Container tree view provider for the VS Code extension.
 *
 * Displays running containers in the sidebar with status, CPU, and memory info.
 */

import * as vscode from 'vscode'
import { DockerClient, ContainerInfo, MetricsStore, MetricsEntry } from '@sentrydesk/core'

type TreeChangeEvent = ContainerTreeItem | ContainerTreeItem[] | undefined | null | void

export class ContainerTreeProvider implements vscode.TreeDataProvider<ContainerTreeItem> {
  private dockerClient: DockerClient
  private metricsStore: MetricsStore
  private _onDidChangeTreeData: vscode.EventEmitter<TreeChangeEvent>
  private containers: ContainerInfo[] = []
  private metricsMap: Map<string, MetricsEntry> = new Map()
  private unsubscribeMetrics: () => void

  readonly onDidChangeTreeData: vscode.Event<TreeChangeEvent>

  constructor(dockerClient: DockerClient, metricsStore: MetricsStore) {
    this.dockerClient = dockerClient
    this.metricsStore = metricsStore
    this._onDidChangeTreeData = new vscode.EventEmitter<TreeChangeEvent>()
    this.onDidChangeTreeData = this._onDidChangeTreeData.event

    // Subscribe to metrics updates
    this.unsubscribeMetrics = this.metricsStore.subscribe((entries: MetricsEntry[]) => {
      for (const entry of entries) {
        this.metricsMap.set(entry.containerId, entry)
      }
      this._onDidChangeTreeData.fire()
    })
  }

  async refresh() {
    try {
      this.containers = this.dockerClient.isConnected() ? await this.dockerClient.getContainers() : []
    } catch {
      this.containers = []
    }
    this._onDidChangeTreeData.fire()
  }

  /**
   * Drop cached containers and metrics (used on disconnect).
   */
  clear() {
    this.containers = []
    this.metricsMap.clear()
    this._onDidChangeTreeData.fire()
  }

  getContainers(): ContainerInfo[] {
    return this.containers
  }

  getTreeItem(element: ContainerTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: ContainerTreeItem): Promise<ContainerTreeItem[]> {
    if (element) {
      // Flat list — containers have no children
      return []
    }

    if (this.containers.length === 0) {
      return [
        new ContainerTreeItem({
          label: 'No containers found',
          description: 'Connect to Docker to see containers',
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

  dispose() {
    this.unsubscribeMetrics()
    this._onDidChangeTreeData.dispose()
  }
}

export interface ContainerTreeItemOptions {
  label: string
  description?: string
  collapsibleState?: vscode.TreeItemCollapsibleState
  iconPath?: vscode.ThemeIcon
  containerId?: string
  containerName?: string
  state?: string
  cpuPercent?: number
  memoryPercent?: number
  memoryUsage?: number
}

export class ContainerTreeItem extends vscode.TreeItem {
  label: string
  containerId?: string
  containerName?: string
  state?: string
  cpuPercent?: number
  memoryPercent?: number
  memoryUsage?: number

  constructor(options: ContainerTreeItemOptions) {
    const collapsibleState = options.collapsibleState ?? vscode.TreeItemCollapsibleState.None
    super(options.label, collapsibleState)
    this.label = options.label
    this.description = options.description
    this.collapsibleState = collapsibleState
    this.iconPath = options.iconPath
    this.containerId = options.containerId
    this.containerName = options.containerName
    this.state = options.state
    this.cpuPercent = options.cpuPercent
    this.memoryPercent = options.memoryPercent
    this.memoryUsage = options.memoryUsage
    // Only real containers get the context value used by inline menu actions
    this.contextValue = options.containerId ? `container-${options.state || 'unknown'}` : 'placeholder'
    this.tooltip = this.formatTooltip()
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
