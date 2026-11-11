/**
 * Shared container picker used when a command runs from the command palette
 * instead of a tree item.
 */

import * as vscode from 'vscode'
import { DockerClient } from '@sentrydesk/core'

export async function pickContainer(
  dockerClient: DockerClient,
  placeHolder: string,
): Promise<{ id: string; name: string } | undefined> {
  if (!dockerClient.isConnected()) {
    vscode.window.showWarningMessage('Not connected to Docker. Run "SentryDesk: Connect to Docker" first.')
    return undefined
  }

  let containers
  try {
    containers = await dockerClient.getContainers()
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to list containers: ${err.message}`)
    return undefined
  }

  if (containers.length === 0) {
    vscode.window.showWarningMessage('No containers found.')
    return undefined
  }

  const selected = await vscode.window.showQuickPick(
    containers.map((c) => ({
      label: c.name,
      description: `${c.state} · ${c.image}`,
      detail: c.id.slice(0, 12),
      id: c.id,
    })),
    { placeHolder },
  )
  if (!selected) return undefined
  return { id: selected.id, name: selected.label }
}
