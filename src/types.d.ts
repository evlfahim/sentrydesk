interface ElectronAPI {
  // App
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>

  // Docker daemon
  dockerConnect: () => Promise<void>
  dockerIsConnected: () => Promise<boolean>
  dockerGetContainers: () => Promise<Array<{
    id: string
    name: string
    image: string
    state: string
    status: string
    cpuPercent: number
    memoryUsage: number
    memoryLimit: number
    memoryPercent: number
    ports: Array<{ ip: string; privatePort: number; publicPort: number; type: string }>
    created: number
  }>>
  dockerGetContainerStats: (containerId: string) => Promise<{
    cpuPercent: number
    memoryUsage: number
    memoryLimit: number
    memoryPercent: number
  } | null>
  dockerRestartContainer: (containerId: string) => Promise<void>
  dockerStopContainer: (containerId: string) => Promise<void>
  dockerStartContainer: (containerId: string) => Promise<void>
  dockerRemoveContainer: (containerId: string, force: boolean) => Promise<void>
  dockerGetContainerLogs: (
    containerId: string,
    options?: { tail?: number; since?: number; timestamps?: boolean; follow?: boolean },
  ) => Promise<string[]>
  dockerGetComposeFiles: (projectName?: string) => Promise<string[]>
  dockerGetComposeFileContent: (projectName: string) => Promise<string>
  dockerGetComposeProjectInfo: (projectName: string) => Promise<{
    name: string
    status: string
    services: number
    configFile: string
  } | null>
  dockerGetDiskUsage: () => Promise<{
    images: { totalSize: number; count: number }
    volumes: { totalSize: number; count: number }
    buildCache: { totalSize: number }
    containers: { totalSize: number; count: number }
  }>

  // Metrics
  metricsStart: () => Promise<void>
  metricsStop: () => Promise<void>
  metricsGet: () => Promise<Array<{
    containerId: string
    containerName: string
    cpuPercent: number
    memoryUsage: number
    memoryLimit: number
    memoryPercent: number
    timestamp: number
  }>>
  metricsGetHistory: (containerId: string) => Promise<Array<{
    containerId: string
    containerName: string
    cpuPercent: number
    memoryUsage: number
    memoryLimit: number
    memoryPercent: number
    timestamp: number
  }>>
  metricsGetContainerNames: () => Promise<string[]>
  metricsGetContainerIds: () => Promise<string[]>
  metricsGetCpuPercent: (containerId: string) => Promise<number>
  metricsGetMemoryPercent: (containerId: string) => Promise<number>
  metricsGetMemoryUsage: (containerId: string) => Promise<number>
  metricsGetMemoryLimit: (containerId: string) => Promise<number>
  metricsClear: () => Promise<void>
  metricsGetTrackedCount: () => Promise<number>
  metricsGetHistoryLength: (containerId: string) => Promise<number>

  // Logs
  logsFetch: (
    containerId: string,
    options?: { tail?: number; since?: number },
  ) => Promise<Array<{
    timestamp: string | null
    stream: 'stdout' | 'stderr'
    message: string
  }>>
  logsGet: (containerId: string) => Promise<Array<{
    timestamp: string | null
    stream: 'stdout' | 'stderr'
    message: string
  }>>
  logsFilter: (
    containerId: string,
    filter: { search?: string; stream?: string; tail?: number },
  ) => Promise<Array<{
    timestamp: string | null
    stream: 'stdout' | 'stderr'
    message: string
  }>>
  logsSetFollow: (containerId: string, follow: boolean) => Promise<void>
  logsIsFollow: (containerId: string) => Promise<boolean>
  logsClear: (containerId?: string) => Promise<void>
  logsGetContainerNames: () => Promise<string[]>
  logsGetLogCount: (containerId: string) => Promise<number>

  // Cleanup
  cleanupAnalyze: () => Promise<Array<{
    id: string
    type: 'image' | 'volume' | 'build-cache' | 'container'
    title: string
    description: string
    size: number
    actionable: boolean
    action: string
    targetId?: string
  }>>
  cleanupGetSuggestions: () => Promise<Array<{
    id: string
    type: 'image' | 'volume' | 'build-cache' | 'container'
    title: string
    description: string
    size: number
    actionable: boolean
    action: string
    targetId?: string
  }>>
  cleanupGetTotalSavings: () => Promise<number>
  cleanupClear: () => Promise<void>

  // Compose
  composeParse: (content: string, projectName?: string) => Promise<{
    path: string
    content: string
    config: {
      version?: string
      name: string
      services: Array<{ name: string; image?: string; build?: string | { context: string; dockerfile?: string }; ports?: Array<{ host: number; container: number; protocol?: string }>; environment?: Record<string, string>; volumes?: string[]; dependsOn?: string[]; restart?: string; networks?: string[]; command?: string; entrypoint?: string; healthcheck?: { test: string; interval?: string; timeout?: string; retries?: number }; [key: string]: unknown }>
      networks: Array<{ name: string; driver?: string; external?: boolean; [key: string]: unknown }>
      volumes: Array<{ name: string; driver?: string; external?: boolean; [key: string]: unknown }>
      raw: string
    } | null
    errors: Array<{ path: string; message: string; severity: 'error' | 'warning' }>
  }>
  composeValidate: (config: {
    version?: string
    name: string
    services: Array<{ name: string; image?: string; build?: string | { context: string; dockerfile?: string }; ports?: Array<{ host: number; container: number; protocol?: string }>; environment?: Record<string, string>; volumes?: string[]; dependsOn?: string[]; restart?: string; networks?: string[]; command?: string; entrypoint?: string; healthcheck?: { test: string; interval?: string; timeout?: string; retries?: number }; [key: string]: unknown }>
    networks: Array<{ name: string; driver?: string; external?: boolean; [key: string]: unknown }>
    volumes: Array<{ name: string; driver?: string; external?: boolean; [key: string]: unknown }>
    raw: string
  }) => Promise<Array<{ path: string; message: string; severity: 'error' | 'warning' }>>
  composeGetServiceSummary: (config: {
    version?: string
    name: string
    services: Array<{ name: string; image?: string; build?: string | { context: string; dockerfile?: string }; ports?: Array<{ host: number; container: number; protocol?: string }>; environment?: Record<string, string>; volumes?: string[]; dependsOn?: string[]; restart?: string; networks?: string[]; command?: string; entrypoint?: string; healthcheck?: { test: string; interval?: string; timeout?: string; retries?: number }; [key: string]: unknown }>
    networks: Array<{ name: string; driver?: string; external?: boolean; [key: string]: unknown }>
    volumes: Array<{ name: string; driver?: string; external?: boolean; [key: string]: unknown }>
    raw: string
  }) => Promise<Array<{
    name: string
    image?: string
    build?: string
    ports: string[]
    status: string
  }>>

  // Events (bidirectional)
  sendDockerEvent: (event: string, data: unknown) => void
  onDockerEvent: (callback: (event: string, data: unknown) => void) => () => void
}

interface Window {
  electronAPI: ElectronAPI
}
