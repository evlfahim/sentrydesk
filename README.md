# SentryDesk

> A lightweight, offline-first desktop dashboard for real-time Docker container monitoring, log management, and resource cleanup — with a modular core that also powers a VS Code extension.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-30.x-47848F)](https://www.electronjs.org/)
[![VS Code](https://img.shields.io/badge/VS_Code-1.85+-0078D4)](https://code.visualstudio.com/)

---

## Table of Contents

- [Why SentryDesk](#why-sentrydesk)
- [Features](#features)
- [Architecture](#architecture)
  - [Desktop App](#desktop-app)
  - [VS Code Extension](#vs-code-extension)
  - [Shared Core](#shared-core)
  - [IPC Bridge](#ipc-bridge)
- [Installation](#installation)
- [Running the Desktop App](#running-the-desktop-app)
- [Running the VS Code Extension](#running-the-vs-code-extension)
- [Architecture Deep Dive](#architecture-deep-dive)
  - [Monorepo Structure](#monorepo-structure)
  - `@sentrydesk/core`
  - [Electron Main Process](#electron-main-process)
  - [React Renderer](#react-renderer)
  - [VS Code Extension](#vs-code-extension-1)
  - [IPC Protocol](#ipc-protocol)
- [Step-by-Step: Converting to a VS Code Plugin](#step-by-step-converting-to-a-vs-code-plugin)
  - [Step 1 — Extract the Core Package](#step-1--extract-the-core-package)
  - [Step 2 — Build the Core Package](#step-2--build-the-core-package)
  - [Step 3 — Scaffold the VS Code Extension](#step-3--scaffold-the-vs-code-extension)
  - [Step 4 — Register Commands](#step-4--register-commands)
  - [Step 5 — Build UI Providers](#step-5--build-ui-providers)
  - [Step 6 — Wire Up the IPC Bridge](#step-6--wire-up-the-ipc-bridge)
  - [Step 7 — Test the Extension](#step-7--test-the-extension)
  - [Step 8 — Package & Distribute](#step-8--package--distribute)
- [API Reference](#api-reference)
  - [Docker Client](#docker-client)
  - [Metrics Store](#metrics-store)
  - [Log Store](#log-store)
  - [Cleanup Engine](#cleanup-engine)
  - [Compose Parser](#compose-parser)
  - [IPC Channels](#ipc-channels)
- [Testing](#testing)
- [Build & Release](#build--release)
- [License](#license)

---

## Why SentryDesk

Existing Docker dashboards fall into one of three categories:

| Category | Examples | Gaps |
|---|---|---|
| **Kubernetes-only** | Kubetail | No native Docker Compose viewing or disk cleanup |
| **Desktop-extension tied** | Docker GPU Dashboard | Bundled with Docker Desktop, not standalone |
| **Heavy orchestrators** | Govard, Nisfere | Niche, slow, no real-time metrics or log search |

SentryDesk fills the gap: a **lightweight, offline-first** desktop dashboard that works with **plain Docker** (no Kubernetes required), provides **live CPU/RAM charts**, **full-text log search**, **one-click restart**, a **Compose YAML viewer**, and **disk cleanup suggestions** — all in a single install with zero cloud dependencies.

The same core logic powers both the desktop app and a VS Code extension, so you get identical Docker management inside your IDE.

---

## Features

| Feature | Desktop | VS Code |
|---|---|---|
| Real-time CPU/RAM per container with live charts | ✅ | ✅ (table view) |
| Full-text log viewer with filtering, search, follow mode | ✅ | ✅ (read-only editor) |
| One-click container restart with lifecycle feedback | ✅ | ✅ (command palette) |
| Docker Compose YAML viewer with syntax highlighting & validation | ✅ | ✅ (parsed report) |
| Disk space analyzer with actionable cleanup suggestions | ✅ | ✅ (markdown report) |
| Zero-config local setup, no cloud dependencies | ✅ | ✅ |
| Modular core enabling VS Code plugin wrapping | ✅ | ✅ |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SentryDesk Monorepo                      │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │   @sentrydesk/core    │    │   packages/plugin/            │  │
│  │   (shared library)    │    │   (VS Code extension)         │  │
│  │                       │    │                               │  │
│  │  ┌─────────────────┐  │    │  ┌────────────────────────┐  │  │
│  │  │ DockerClient     │  │    │  │ ContainerTreeProvider  │  │  │
│  │  │ MetricsStore     │  │    │  │ LogPanelProvider       │  │  │
│  │  │ LogStore         │  │    │  │ MetricsPanelProvider   │  │  │
│  │  │ CleanupEngine    │  │    │  │ ComposePanelProvider   │  │  │
│  │  │ Compose parser   │  │    │  │ CleanupPanelProvider   │  │  │
│  │  └─────────────────┘  │    │  └────────────────────────┘  │  │
│  │                       │    │                               │  │
│  │  ┌─────────────────┐  │    │  ┌────────────────────────┐  │  │
│  │  │ Dockerode SDK   │  │    │  │ CoreBridge              │  │  │
│  │  │ js-yaml         │  │    │  │ IpcServer (NDJSON)      │  │  │
│  │  └─────────────────┘  │    │  │ IpcSocketClient         │  │  │
│  │                       │    │  └────────────────────────┘  │  │
│  └──────────────────────┘    └──────────────────────────────┘  │
│           ▲  ▲  ▲  ▲  ▲  ▲  ▲  ▲  ▲  ▲  ▲  ▲  ▲  ▲  ▲  ▲       │
│           │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │       │
│  ┌────────┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴────────┐│
│  │                    IPC Bridge Layer                         ││
│  │                                                             ││
│  │  Electron main process  ◄────►  React renderer (Vite)       ││
│  │  VS Code extension host  ◄────►  CoreBridge (in-process)    ││
│  │  External tools  ◄────►  IpcServer (Unix socket / named pipe)││
│  └─────────────────────────────────────────────────────────────┘│
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Docker Daemon                           │    │
│  │  (Unix socket / TCP endpoint)                            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Desktop App

```
electron/main.ts          Electron main process
  ├── IPC handlers (docker:*, metrics:*, logs:*, cleanup:*, compose:*)
  └── BrowserWindow → Vite dev server / dist/index.html

electron/preload.ts       Context bridge → window.electronAPI

src/                      React + Vite renderer
  ├── App.tsx             Root component with header + panels
  ├── ui/*.tsx            Panel components (metrics, logs, compose, cleanup)
  ├── docker/client.ts    DockerClient (re-exported from @sentrydesk/core)
  ├── metrics/metrics.ts  MetricsStore (re-exported from @sentrydesk/core)
  ├── logs/logs.ts        LogStore (re-exported from @sentrydesk/core)
  ├── disk/cleanup.ts     CleanupEngine (re-exported from @sentrydesk/core)
  ├── compose/compose.ts  Compose parser (re-exported from @sentrydesk/core)
  └── restart/restart.ts  RestartHandler (re-exported from @sentrydesk/core)
```

The Electron main process imports `@sentrydesk/core` directly and registers IPC handlers. The React renderer calls `window.electronAPI` methods, which route through IPC to the main process.

### VS Code Extension

```
packages/plugin/src/
  ├── extension.ts          activate() / deactivate()
  ├── commands/*.ts         Command registration modules
  ├── ui/*.ts               UI provider classes (tree, panels)
  ├── ipc/handlers.ts       CoreBridge + createCoreHandlers()
  └── ipc/server.ts         IpcServer + IpcSocketClient
```

The extension imports `@sentrydesk/core` directly, creates UI providers (tree view, panels), registers 20+ commands, and optionally exposes an IPC server on a Unix socket.

### Shared Core

```
packages/core/src/
  ├── index.ts              Barrel exports
  ├── docker/client.ts      DockerClient (singleton, Dockerode wrapper)
  ├── metrics/metrics.ts    MetricsStore (singleton, real-time polling)
  ├── logs/logs.ts          LogStore (singleton, follow mode, filtering)
  ├── disk/cleanup.ts       CleanupEngine (singleton, analysis suggestions)
  ├── compose/compose.ts    Compose parser, validator, service summary
  └── restart/restart.ts    RestartHandler (lifecycle management)
```

All core classes are singletons. They are pure TypeScript with only `dockerode` and `js-yaml` as dependencies — no UI framework, no Electron, no VS Code.

### IPC Bridge

The IPC bridge is the layer that lets external consumers talk to `@sentrydesk/core`:

| Consumer | Transport | Channel names |
|---|---|---|
| Electron renderer | Electron IPC (`ipcRenderer.invoke`) | `docker:*`, `metrics:*`, `logs:*`, `cleanup:*`, `compose:*` |
| VS Code extension | In-process `CoreBridge.invoke()` | Same 30+ channels |
| External tools | Unix socket / named pipe (NDJSON) | Same 30+ channels |

The channel names are **identical** across all three transports, so a tool that speaks the NDJSON protocol works with both the desktop app and the VS Code extension without modification.

---

## Installation

### Prerequisites

- **Node.js 22+** (LTS recommended)
- **npm 10+**
- **Docker Desktop** or **Docker Engine** with the Docker socket accessible
- **VS Code 1.85+** (for the extension)

### Clone & Install

```bash
git clone https://github.com/sentrydesk/sentrydesk.git
cd sentrydesk
npm install
```

This installs dependencies for the root workspace, `@sentrydesk/core`, and the VS Code extension.

---

## Running the Desktop App

### Development mode

```bash
npm run electron:dev
```

This starts the Vite dev server on `http://localhost:5173` and launches Electron, which loads the dev server. Hot-reload is enabled for the React renderer.

### Production build

```bash
npm run build:desktop
```

This:
1. Builds `@sentrydesk/core` (`tsc`)
2. Compiles TypeScript (`tsc`)
3. Builds the React app (`vite build`)
4. Compiles Electron files (`tsc -p tsconfig.electron.json`)
5. Packages with `electron-builder`

The resulting binaries are in the `release/` directory:

| Platform | Targets | Output |
|---|---|---|
| Linux | AppImage, deb | `release/SentryDesk-0.1.0.AppImage`, `release/sentrydesk_0.1.0_amd64.deb` |
| Windows | NSIS | `release/SentryDesk Setup 0.1.0.exe` |
| macOS | DMG, zip | `release/SentryDesk 0.1.0.dmg`, `release/SentryDesk 0.1.0.zip` |

### Run the built binary

```bash
./release/linux-unpacked/sentrydesk
```

---

## Running the VS Code Extension

### From source (debugging)

1. Open the project in VS Code.
2. Open the **Run and Debug** panel (`Ctrl+Shift+D`).
3. Select the **Launch Extension** configuration and press `F5`.

This starts a new VS Code window with the SentryDesk extension loaded in development mode.

### Install from source

```bash
cd packages/plugin
npm run build
```

Then in VS Code:
1. Open the Extensions view (`Ctrl+Shift+X`).
2. Click the `...` menu → **Install from VSIX…** → select `packages/plugin/dist/` (or use `code --install-extension`).

### Configure

Open VS Code settings (`Ctrl+,`) and search for `sentrydesk`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `sentrydesk.ipc.enabled` | boolean | `true` | Expose `@sentrydesk/core` over a local IPC socket |

### Use the extension

1. Open the Command Palette (`Ctrl+Shift+P`).
2. Run **SentryDesk: Connect to Docker**.
3. Open the **SentryDesk** sidebar view to see containers.
4. Right-click a container for inline actions (logs, metrics, restart, stop, remove).
5. Use toolbar buttons for Compose viewer and disk cleanup.

---

## Architecture Deep Dive

### Monorepo Structure

```
sentrydesk/
├── package.json              Root workspace manifest
├── tsconfig.json             Root TypeScript config
├── tsconfig.electron.json    Electron main/preload compilation
├── vite.config.ts            Vite (React renderer) config
├── vitest.config.ts          Vitest test config
├── electron/
│   ├── main.ts               Electron main process entry
│   └── preload.ts            Context bridge (window.electronAPI)
├── src/                      React renderer source
│   ├── main.tsx              React entry point
│   ├── App.tsx               Root component
│   ├── App.css               Global styles
│   ├── index.css             CSS reset / base styles
│   ├── types.d.ts            Global type declarations
│   ├── docker/client.ts      DockerClient re-export
│   ├── metrics/metrics.ts    MetricsStore re-export
│   ├── logs/logs.ts          LogStore re-export
│   ├── disk/cleanup.ts       CleanupEngine re-export
│   ├── compose/compose.ts    Compose parser re-export
│   ├── restart/restart.ts    RestartHandler re-export
│   ├── ipc/client.ts         IPC client utilities
│   ├── ui/
│   │   ├── metrics-panel.tsx Metrics panel component
│   │   ├── log-panel.tsx     Log panel component
│   │   ├── log-store.tsx     Log store hook
│   │   ├── metrics-store.tsx Metrics store hook
│   │   ├── compose-panel.tsx Compose panel component
│   │   └── cleanup-panel.tsx Cleanup panel component
│   └── __tests__/            Test files
├── packages/
│   ├── core/                 @sentrydesk/core shared package
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts      Barrel exports
│   │       ├── docker/client.ts
│   │       ├── metrics/metrics.ts
│   │       ├── logs/logs.ts
│   │       ├── disk/cleanup.ts
│   │       ├── compose/compose.ts
│   │       ├── restart/restart.ts
│   │       └── __tests__/core.test.ts
│   └── plugin/               VS Code extension
│       ├── package.json      Extension manifest (commands, views, menus)
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── src/
│           ├── extension.ts  activate / deactivate
│           ├── commands/     Command registration modules
│           ├── ui/           UI provider classes
│           ├── ipc/          CoreBridge + IpcServer
│           └── __tests__/    Test files
└── release/                  Built binaries (gitignored)
```

### `@sentrydesk/core`

The shared library is a pure TypeScript package with zero UI dependencies. It exports:

- **`DockerClient`** — Singleton wrapping `dockerode`. Methods: `connect()`, `getContainers()`, `getContainerStats()`, `restartContainer()`, `stopContainer()`, `startContainer()`, `removeContainer()`, `getContainerLogs()`, `getDiskUsage()`, `getComposeFiles()`, `getComposeFileContent()`, `getComposeProjectInfo()`.

- **`MetricsStore`** — Singleton that polls Docker stats every 2 seconds. Methods: `start()`, `stop()`, `subscribe()`, `getMetrics()`, `getHistory()`, `getCpuPercent()`, `getMemoryPercent()`, `getMemoryUsage()`, `getMemoryLimit()`, `clear()`, `getTrackedCount()`.

- **`LogStore`** — Singleton managing container logs. Methods: `fetchLogs()`, `getLogs()`, `filterLogs()`, `setFollowMode()`, `isFollowMode()`, `clearLogs()`, `subscribe()`.

- **`CleanupEngine`** — Singleton analyzing Docker disk usage. Methods: `analyze()`, `getSuggestions()`, `getTotalSavings()`, `clear()`.

- **`parseComposeFile()` / `validateCompose()` / `getServiceSummary()`** — Pure functions for parsing, validating, and summarizing Docker Compose YAML.

- **`RestartHandler`** — Singleton for container lifecycle management.

### Electron Main Process

`electron/main.ts` imports `@sentrydesk/core` directly and registers IPC handlers for every channel:

```typescript
ipcMain.handle('docker:connect', async () => {
  return DockerClient.getInstance().connect()
})

ipcMain.handle('metrics:start', () => {
  MetricsStore.getInstance().start()
})

ipcMain.handle('logs:fetch', async (_event, containerId, options) => {
  return LogStore.getInstance().fetchLogs(containerId, options)
})
```

The main process also creates the `BrowserWindow` and loads either the Vite dev server URL or the built `dist/index.html`.

### React Renderer

The React app (`src/`) uses Vite for bundling. The root `App.tsx` component:

1. Fetches app version and platform via `window.electronAPI`.
2. Attempts to auto-connect to Docker.
3. Renders four panel components: `MetricsPanel`, `LogPanel`, `ComposePanel`, `CleanupPanel`.

Each panel component imports from `@sentrydesk/core` via the `window.electronAPI` IPC bridge.

### VS Code Extension

The extension (`packages/plugin/src/`) follows the standard VS Code extension pattern:

1. **Activation** — `activate()` is called on `onStartupFinished`.
2. **Core instances** — Creates singletons from `@sentrydesk/core`.
3. **UI providers** — Creates tree view and panel providers.
4. **Commands** — Registers 20+ commands via `vscode.commands.registerCommand()`.
5. **IPC server** — Optionally starts an NDJSON server on a Unix socket.
6. **Auto-connect** — Attempts to connect to Docker on activation.

### IPC Protocol

The NDJSON protocol over Unix socket uses this format:

**Request:**
```json
{"id": 1, "channel": "docker:get-containers", "args": []}
```

**Success response:**
```json
{"id": 1, "ok": true, "result": [{"id": "...", "name": "...", ...}]}
```

**Error response:**
```json
{"id": 1, "ok": false, "error": "Docker client not connected"}
```

The `IpcSocketClient` class handles request/response correlation by ID.

---

## Step-by-Step: Converting to a VS Code Plugin

The architecture is designed so that the core Docker logic can be used in any context. Here's how the conversion was done:

### Step 1 — Extract the Core Package

All Docker client, metrics, logs, cleanup, compose, and restart logic was moved from the root `src/` into `packages/core/src/`. The package exports a clean API:

```typescript
// packages/core/src/index.ts
export { DockerClient, ContainerInfo, ContainerStats } from './docker/client'
export { MetricsStore, MetricsEntry, MetricsCallback } from './metrics/metrics'
export { LogStore, LogEntry, LogFilter, LogStoreListener } from './logs/logs'
export { CleanupEngine, CleanupSuggestion } from './disk/cleanup'
export { ComposeService, ComposeConfig, parseComposeFile, validateCompose, getServiceSummary } from './compose/compose'
export { RestartHandler, ContainerLifecycleStatus } from './restart/restart'
```

The package has only two runtime dependencies: `dockerode` and `js-yaml`.

### Step 2 — Build the Core Package

```bash
npm -C packages/core run build
```

This compiles TypeScript to `packages/core/dist/`. The root `package.json` depends on `"@sentrydesk/core": "*"` via npm workspaces, so the desktop app automatically uses the built package.

### Step 3 — Scaffold the VS Code Extension

Create `packages/plugin/` with:

```json
// packages/plugin/package.json
{
  "name": "sentrydesk-vscode",
  "displayName": "SentryDesk",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "commands": [ ... ],
    "viewsContainers": { ... },
    "views": { ... },
    "menus": { ... }
  },
  "dependencies": { "@sentrydesk/core": "*" }
}
```

The `tsconfig.json` targets CommonJS with Node resolution:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "dist",
    "esModuleInterop": true,
    "declaration": true
  }
}
```

### Step 4 — Register Commands

Create command modules in `packages/plugin/src/commands/`:

```typescript
// commands/docker.ts
export function registerDockerCommands(dockerClient, treeProvider, metricsStore) {
  return [
    vscode.commands.registerCommand('sentrydesk.connect', async () => {
      await dockerClient.connect()
      metricsStore?.start()
      vscode.window.showInformationMessage('Connected to Docker daemon')
      await treeProvider.refresh()
    }),
    // ... more commands
  ]
}
```

Each command module returns an array of `vscode.Disposable`. The extension's `activate()` collects all disposables and adds them to `context.subscriptions`.

### Step 5 — Build UI Providers

Create UI provider classes in `packages/plugin/src/ui/`:

- **`ContainerTreeProvider`** — Implements `vscode.TreeDataProvider<ContainerTreeItem>`. Displays containers in the sidebar with status, CPU, and memory info.
- **`LogPanelProvider`** — Opens a read-only editor panel showing container logs with follow mode.
- **`MetricsPanelProvider`** — Opens a read-only editor panel showing live CPU/RAM metrics in a markdown table.
- **`ComposePanelProvider`** — Opens a read-only editor panel showing parsed Compose YAML with validation results.
- **`CleanupPanelProvider`** — Opens a read-only editor panel showing disk usage and cleanup suggestions.

### Step 6 — Wire Up the IPC Bridge

The `CoreBridge` class and `createCoreHandlers()` function map channel names to `@sentrydesk/core` methods:

```typescript
// ipc/handlers.ts
export function createCoreHandlers(services) {
  return {
    'docker:connect': () => services.dockerClient.connect(),
    'docker:get-containers': () => services.dockerClient.getContainers(),
    'metrics:start': () => services.metricsStore.start(),
    'logs:fetch': (containerId, options) => services.logStore.fetchLogs(containerId, options),
    // ... 30+ channels
  }
}

export class CoreBridge {
  async invoke(channel, ...args) {
    return this.handlers[channel](...args)
  }
}
```

The `IpcServer` class serves these handlers over a Unix socket using NDJSON. External tools can connect and invoke any channel.

### Step 7 — Test the Extension

```bash
npm run test:plugin
```

The test suite (`packages/plugin/src/__tests__/plugin.test.ts`) has 29 tests across 7 describe blocks:

- Core singletons
- Tree provider
- Log panel
- Metrics panel
- Compose panel
- Cleanup panel
- Command registrations
- IPC bridge (in-process + socket)

### Step 8 — Package & Distribute

```bash
npm run build:plugin
```

This builds `@sentrydesk/core` first, then compiles the extension to `packages/plugin/dist/extension.js`. The output can be packaged as a VSIX:

```bash
npx vsce package -o sentrydesk-vscode-0.1.0.vsix
```

---

## API Reference

### Docker Client

```typescript
class DockerClient {
  static getInstance(): DockerClient
  connect(): Promise<void>
  isConnected(): boolean
  getContainers(): Promise<ContainerInfo[]>
  getContainerStats(id: string): Promise<ContainerStats | null>
  restartContainer(id: string): Promise<void>
  stopContainer(id: string): Promise<void>
  startContainer(id: string): Promise<void>
  removeContainer(id: string, force?: boolean): Promise<void>
  getContainerLogs(id: string, options?: { tail?: number; since?: number; timestamps?: boolean; follow?: boolean }): Promise<string[]>
  getDiskUsage(): Promise<{ images: { totalSize: number; count: number }; volumes: { totalSize: number; count: number }; buildCache: { totalSize: number }; containers: { totalSize: number; count: number } }>
}
```

### Metrics Store

```typescript
class MetricsStore {
  static getInstance(): MetricsStore
  start(): void
  stop(): void
  subscribe(listener: (entries: MetricsEntry[]) => void): () => void
  getMetrics(containerId?: string): MetricsEntry[]
  getHistory(containerId: string): MetricsEntry[]
  getCpuPercent(containerId: string): number
  getMemoryPercent(containerId: string): number
  getMemoryUsage(containerId: string): number
  getMemoryLimit(containerId: string): number
  clear(): void
  getTrackedCount(): number
}
```

### Log Store

```typescript
class LogStore {
  static getInstance(): LogStore
  fetchLogs(containerId: string, options?: { tail?: number; since?: number }): Promise<LogEntry[]>
  getLogs(containerId: string): LogEntry[]
  filterLogs(containerId: string, filter: { search?: string; stream?: 'stdout' | 'stderr' | 'all'; tail?: number }): LogEntry[]
  setFollowMode(containerId: string, follow: boolean): void
  isFollowMode(containerId: string): boolean
  clearLogs(containerId?: string): void
  subscribe(listener: (containerId: string, entries: LogEntry[]) => void): () => void
}
```

### Cleanup Engine

```typescript
class CleanupEngine {
  static getInstance(): CleanupEngine
  analyze(): Promise<CleanupSuggestion[]>
  getSuggestions(): CleanupSuggestion[]
  getTotalSavings(): number
  clear(): void
}
```

### Compose Parser

```typescript
function parseComposeFile(content: string, projectName?: string): ComposeFile
function validateCompose(config: ComposeConfig): ComposeValidationError[]
function getServiceSummary(config: ComposeConfig): Array<{ name: string; image?: string; build?: string; ports: string[]; status: string }>
```

### IPC Channels

| Channel | Args | Returns |
|---|---|---|
| `docker:connect` | — | `void` |
| `docker:is-connected` | — | `boolean` |
| `docker:get-containers` | — | `ContainerInfo[]` |
| `docker:get-container-stats` | `containerId: string` | `ContainerStats \| null` |
| `docker:restart-container` | `containerId: string` | `void` |
| `docker:stop-container` | `containerId: string` | `void` |
| `docker:start-container` | `containerId: string` | `void` |
| `docker:remove-container` | `containerId: string, force?: boolean` | `void` |
| `docker:get-container-logs` | `containerId: string, options?` | `string[]` |
| `docker:get-disk-usage` | — | `DiskUsage` |
| `metrics:start` | — | `void` |
| `metrics:stop` | — | `void` |
| `metrics:get` | `containerId?: string` | `MetricsEntry[]` |
| `metrics:get-history` | `containerId: string` | `MetricsEntry[]` |
| `metrics:get-container-names` | — | `string[]` |
| `metrics:get-container-ids` | — | `string[]` |
| `metrics:clear` | — | `void` |
| `metrics:get-tracked-count` | — | `number` |
| `logs:fetch` | `containerId: string, options?` | `LogEntry[]` |
| `logs:get` | `containerId: string` | `LogEntry[]` |
| `logs:filter` | `containerId: string, filter` | `LogEntry[]` |
| `logs:set-follow` | `containerId: string, follow: boolean` | `void` |
| `logs:is-follow` | `containerId: string` | `boolean` |
| `logs:clear` | `containerId?: string` | `void` |
| `logs:get-container-names` | — | `string[]` |
| `logs:get-log-count` | `containerId: string` | `number` |
| `cleanup:analyze` | — | `CleanupSuggestion[]` |
| `cleanup:get-suggestions` | — | `CleanupSuggestion[]` |
| `cleanup:get-total-savings` | — | `number` |
| `cleanup:clear` | — | `void` |
| `compose:parse` | `content: string, projectName?: string` | `ComposeFile` |
| `compose:validate` | `config: ComposeConfig` | `ComposeValidationError[]` |
| `compose:get-service-summary` | `config: ComposeConfig` | `ServiceSummary[]` |

---

## Testing

### Run all tests

```bash
npm test
```

This runs the full Vitest suite: **307 tests** across the root app, `@sentrydesk/core`, and the VS Code extension.

### Run specific test suites

```bash
npm run test:client       # Docker client tests
npm run test:metrics      # Metrics store tests
npm run test:logs         # Log store tests
npm run test:restart      # Restart handler tests
npm run test:compose      # Compose parser tests
npm run test:disk         # Cleanup engine tests
npm run test:core         # Core package tests
npm run test:ipc          # IPC bridge tests
npm run test:plugin       # VS Code extension tests
```

### Run tests in watch mode

```bash
npm run test:watch
```

---

## Build & Release

### Desktop app

```bash
# Full build (core + app + Electron + packaging)
npm run build:desktop

# Build just the renderer (for development)
npm run build:vite

# Build just the Electron files
npm run build:electron
```

### VS Code extension

```bash
npm run build:plugin
```

### Type checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

---

## License

MIT
