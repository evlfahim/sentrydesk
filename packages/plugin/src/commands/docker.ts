/**
 * Docker commands for the VS Code extension.
 *
 * Provides connect, disconnect, refresh, restart, stop, start, and remove
 * commands that operate on the Docker daemon via @sentrydesk/core.
 */

import * as vscode from 'vscode'
import { DockerClient, ContainerInfo } from '@sentrydesk/core'
import { ContainerTreeProvider } from '../ui/tree'

export function registerDockerCommands(
  dockerClient: DockerClient,
  treeProvider: ContainerTreeProvider,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = []

  // Connect to Docker
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.connect', async () => {
      try {
        await dockerClient.connect()
        vscode.window.showInformationMessage('Connected to Docker daemon')
        await refreshContainers()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to connect to Docker: ${err.message}`)
      }
    }),
  )

  // Disconnect from Docker
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.disconnect', async () => {
      dockerClient.disconnect()
      vscode.window.showInformationMessage('Disconnected from Docker daemon')
      await refreshContainers()
    }),
  )

  // Refresh containers
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.refresh', async () => {
      await refreshContainers()
    }),
  )

  // Restart container (from tree view context)
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.restart', async (node?: any) => {
      const containerId = getContainerId(node)
      if (!containerId) return

      try {
        await dockerClient.restartContainer(containerId)
        vscode.window.showInformationMessage(`Container ${containerId.slice(0, 8)} restarted`)
        await refreshContainers()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to restart container: ${err.message}`)
      }
    }),
  )

  // Stop container
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.stop', async (node?: any) => {
      const containerId = getContainerId(node)
      if (!containerId) return

      try {
        await dockerClient.stopContainer(containerId)
        vscode.window.showInformationMessage(`Container ${containerId.slice(0, 8)} stopped`)
        await refreshContainers()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to stop container: ${err.message}`)
      }
    }),
  )

  // Start container
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.start', async (node?: any) => {
      const containerId = getContainerId(node)
      if (!containerId) return

      try {
        await dockerClient.startContainer(containerId)
        vscode.window.showInformationMessage(`Container ${containerId.slice(0, 8)} started`)
        await refreshContainers()
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to start container: ${err.message}`)
      }
    }),
  )

  // Remove container
  disposables.push(
    vscode.commands.registerCommand('sentrydesk.remove', async (node?: any) => {
      const containerId = getContainerId(node)
      if (!containerId) return

      const confirmed = await vscode.window.showWarningMessage(
        `Are you sure you want to remove container ${containerId.slice(0, 8)}?`,
        { modal: true },
        'Yes',
        'No',
      )
      if (confirmed !== 'Yes') return

      try {
        await dockerClient.removeContainer(containerId, true)
        vscode.window.showInformationMessage(`Container ${containerId.slice(0, 8)} removed`)
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

  return disposables
}

function getContainerId(node: any): string | undefined {
  if (!node) return undefined
  if (node.containerId) return node.containerId
  if (node.id) return node.id
  return undefined
}
