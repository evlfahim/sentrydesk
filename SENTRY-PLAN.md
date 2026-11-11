# SentryDesk

> A lightweight, offline-first desktop dashboard for real-time Docker container monitoring, log management, and resource cleanup, designed with a modular architecture for seamless VS Code extension integration.

Task: Docker container dashboard for the desktop: live CPU/RAM per container, logs with search, one-click restart, compose file viewer, disk space cleanup suggestions; later a VS Code plugin #plugin #desktop

## Why it is better than what exists
- Kubetail focuses on Kubernetes and lacks native Docker Compose viewing and disk cleanup tools.
- Docker GPU Dashboard is a single-purpose extension tied to Docker Desktop, not a standalone desktop app.
- Govard and Nisfere are heavy, niche orchestrators that don't prioritize live metrics and log search.
- Existing compose dashboards are static UI wrappers without real-time resource tracking or cleanup suggestions.

## Features
- Real-time CPU/RAM metrics per container with live charts
- Full-text log viewer with filtering, search, and follow mode
- One-click container restart with lifecycle status feedback
- Docker Compose YAML viewer with syntax highlighting and structure validation
- Disk space analyzer with actionable cleanup suggestions (images, volumes, build cache)
- Zero-config local setup with no cloud dependencies or paid services
- Modular core/UI separation enabling VS Code plugin wrapping

## Stack
TypeScript/Node.js (Electron for desktop shell, React/Vite for UI, Dockerode SDK for Docker API, IPC for core/UI communication)

## Becoming a plugin
Core Docker client, metrics fetcher, log parser, and cleanup engine are extracted into a shared @sentrydesk/core TypeScript package. The desktop app consumes this package directly via IPC, while the VS Code plugin imports the same package and bridges its commands to the Docker daemon through a lightweight IPC server. This ensures identical behavior across desktop and IDE without code duplication.

## Steps
- [x] 1. Scaffold project with Vite, React, Electron, and Dockerode, then run npm test to verify baseline.
- [x] 2. Implement Docker client wrapper and validate connection using docker ps equivalent via npm run test:client.
- [x] 3. Build real-time CPU/RAM metrics stream and verify output via npm run test:metrics.
- [x] 4. Create log viewer with search/filter and confirm functionality with npm run test:logs.
- [x] 5. Add one-click restart handler and verify container lifecycle changes via npm run test:restart.
- [x] 6. Implement Docker Compose YAML viewer and validate parsing with npm run test:compose.
- [x] 7. Develop disk space analyzer and verify cleanup suggestions with npm run test:disk.
- [x] 8. Extract all Docker client and metrics logic into a shared @sentrydesk/core package, then run npm run test:core.
- [ ] 9. Set up IPC bridge between Electron main process and React UI, then run npm run test:ipc.
- [ ] 10. Package the desktop application and verify cross-platform builds with npm run build:desktop.
- [ ] 11. Scaffold VS Code extension, register commands, and connect to @sentrydesk/core via IPC, then run npm run test:plugin.
- [ ] 12. Write comprehensive README with run instructions, architecture diagram, and step-by-step plugin conversion guide.
