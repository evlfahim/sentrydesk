/**
 * Lightweight local IPC server for the VS Code extension.
 *
 * Serves the CoreBridge over a Unix domain socket (or a named pipe on
 * Windows) using newline-delimited JSON:
 *
 *   request:  {"id": 1, "channel": "docker:get-containers", "args": []}
 *   response: {"id": 1, "ok": true, "result": [...]}
 *             {"id": 1, "ok": false, "error": "message"}
 *
 * IpcSocketClient is the matching client, used by external tools and tests.
 */

import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { CoreBridge } from './handlers'

export interface IpcRequest {
  id: number
  channel: string
  args?: unknown[]
}

export interface IpcResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

export function defaultSocketPath(name = `sentrydesk-${process.pid}`): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${name}`
  }
  return path.join(os.tmpdir(), `${name}.sock`)
}

export class IpcServer {
  private bridge: CoreBridge
  private server: net.Server | null = null
  private sockets: Set<net.Socket> = new Set()
  private _socketPath: string

  constructor(bridge: CoreBridge, socketPath: string = defaultSocketPath()) {
    this.bridge = bridge
    this._socketPath = socketPath
  }

  get socketPath(): string {
    return this._socketPath
  }

  isListening(): boolean {
    return this.server !== null && this.server.listening
  }

  async start(): Promise<void> {
    if (this.server) return

    // Remove a stale socket file left by a crashed session
    if (process.platform !== 'win32' && fs.existsSync(this._socketPath)) {
      fs.unlinkSync(this._socketPath)
    }

    const server = net.createServer((socket) => this.handleConnection(socket))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this._socketPath, () => {
        server.off('error', reject)
        resolve()
      })
    })
    this.server = server
  }

  async stop(): Promise<void> {
    if (!this.server) return

    for (const socket of this.sockets) {
      socket.destroy()
    }
    this.sockets.clear()

    const server = this.server
    this.server = null
    await new Promise<void>((resolve) => server.close(() => resolve()))

    if (process.platform !== 'win32' && fs.existsSync(this._socketPath)) {
      fs.unlinkSync(this._socketPath)
    }
  }

  private handleConnection(socket: net.Socket) {
    this.sockets.add(socket)
    socket.setEncoding('utf-8')
    let buffer = ''

    socket.on('data', (chunk: string) => {
      buffer += chunk
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line.length > 0) {
          this.handleLine(socket, line)
        }
        newline = buffer.indexOf('\n')
      }
    })
    socket.on('close', () => this.sockets.delete(socket))
    socket.on('error', () => this.sockets.delete(socket))
  }

  private async handleLine(socket: net.Socket, line: string) {
    let request: IpcRequest
    try {
      request = JSON.parse(line)
    } catch {
      this.send(socket, { id: -1, ok: false, error: 'Invalid JSON request' })
      return
    }

    try {
      const result = await this.bridge.invoke(request.channel, ...(request.args || []))
      this.send(socket, { id: request.id, ok: true, result })
    } catch (err: any) {
      this.send(socket, { id: request.id, ok: false, error: err?.message || String(err) })
    }
  }

  private send(socket: net.Socket, response: IpcResponse) {
    if (!socket.destroyed) {
      socket.write(JSON.stringify(response) + '\n')
    }
  }
}

export class IpcSocketClient {
  private socket: net.Socket | null = null
  private nextId = 1
  private pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map()
  private buffer = ''

  constructor(private readonly socketPath: string) {}

  async connect(): Promise<void> {
    if (this.socket) return

    const socket = net.createConnection(this.socketPath)
    socket.setEncoding('utf-8')
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject)
      socket.once('connect', () => {
        socket.off('error', reject)
        resolve()
      })
    })

    socket.on('data', (chunk: string) => {
      this.buffer += chunk
      let newline = this.buffer.indexOf('\n')
      while (newline !== -1) {
        const line = this.buffer.slice(0, newline).trim()
        this.buffer = this.buffer.slice(newline + 1)
        if (line.length > 0) {
          this.handleResponse(JSON.parse(line) as IpcResponse)
        }
        newline = this.buffer.indexOf('\n')
      }
    })
    socket.on('close', () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error('IPC connection closed'))
      }
      this.pending.clear()
      this.socket = null
    })

    this.socket = socket
  }

  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    if (!this.socket) {
      return Promise.reject(new Error('IPC client not connected'))
    }
    const id = this.nextId++
    const request: IpcRequest = { id, channel, args }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.socket!.write(JSON.stringify(request) + '\n')
    })
  }

  close(): void {
    if (this.socket) {
      this.socket.end()
      this.socket.destroy()
      this.socket = null
    }
  }

  private handleResponse(response: IpcResponse) {
    const entry = this.pending.get(response.id)
    if (!entry) return
    this.pending.delete(response.id)
    if (response.ok) {
      entry.resolve(response.result)
    } else {
      entry.reject(new Error(response.error || 'IPC request failed'))
    }
  }
}
