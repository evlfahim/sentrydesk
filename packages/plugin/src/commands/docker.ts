/**
 * Docker commands for the VS Code extension.
 *
 * Provides connect, disconnect, refresh, restart, stop, start, and remove
 * commands that operate on the Docker daemon via @sentrydesk/core.
 */

import * as vscode from 'vscode'
import { DockerClient, MetricsStore } from '@sentrydesk/core'
import { ContainerTreeProvider } from '../ui/tree'
import { pickContainer } from './pick'

export function registerDockerCommands(
  dockerClient: DockerClient,
  treeProvider: ContainerTreeProvider,
  metricsStore?: MetricsStore,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = []

  // Connect to Docker
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.connect', async () => {
      try {
        await dockerClient.connect()
        metricsStore?.start()
        vscode.window.showInformationMessage('Connected to Docker daemon')
        await refreshContainers()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to connect to Docker: ${err.message}`)
      }
    }),
  )

  // Disconnect from Docker — the daemon API is stateless HTTP, so this stops
  // polling and clears cached state in the views
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.disconnect', async () => {
      metricsStore?.stop()
      treeProvider.clear()
      vscode.window.showInformationMessage('Disconnected from Docker daemon')
    }),
  )

  // Refresh containers
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.refresh', async () => {
      await refreshContainers()
    }),
  )

  // Restart container (from tree view context or command palette)
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.restart', async (node?: any) => {
      const target = await resolveTarget(node, 'restart')
      if (!target) return

      try {
        await dockerClient.restartContainer(target.id)
        vscode.window.showInformationMessage(`Container ${target.name} restarted`)
        await refreshContainers()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to restart container: ${err.message}`)
      }
    }),
  )

  // Stop container
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.stop', async (node?: any) => {
      const target = await resolveTarget(node, 'stop')
      if (!target) return

      try {
        await dockerClient.stopContainer(target.id)
        vscode.window.showInformationMessage(`Container ${target.name} stopped`)
        await refreshContainers()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to stop container: ${err.message}`)
      }
    }),
  )

  // Start container
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.start', async (node?: any) => {
      const target = await resolveTarget(node, 'start')
      if (!target) return

      try {
        await dockerClient.startContainer(target.id)
        vscode.window.showInformationMessage(`Container ${target.name} started`)
        await refreshContainers()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to start container: ${err.message}`)
      }
    }),
  )

  // Remove container
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.remove', async (node?: any) => {
      const target = await resolveTarget(node, 'remove')
      if (!target) return

      const confirmed = await vscode.window.showWarningMessage(
        `Are you sure you want to remove container ${target.name}?`,
        { modal: true },
        'Yes',
      )
      if (confirmed !== 'Yes') return

      try {
        await dockerClient.removeContainer(target.id, true)
        vscode.window.showInformationMessage(`Container ${target.name} removed`)
        await refreshContainers()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to remove container: ${err.message}`)
      }
    }),
  )

  async function refreshContainers() {
    try {
      await treeProvider.refresh()
    } catch {
      // Tree refresh errors are non-critical
    }
  }

  async function resolveTarget(node: any, action: string) {
    if (node && (node.containerId || node.id)) {
      const id: string = node.containerId || node.id
      return { id, name: node.containerName || node.name || id.slice(0, 12) }
    }
    return pickContainer(dockerClient, `Select a container to ${action}`)
  }

  return disposables
}
