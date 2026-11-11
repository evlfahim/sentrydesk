interface ElectronAPI {
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  sendDockerEvent: (event: string, data: unknown) => void
  onDockerEvent: (callback: (event: string, data: unknown) => void) => () => void
}

interface Window {
  electronAPI: ElectronAPI
}
