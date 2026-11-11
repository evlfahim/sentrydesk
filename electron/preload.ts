import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  // Docker IPC channels (to be implemented in later steps)
  sendDockerEvent: (event: string, data: unknown) =>
    ipcRenderer.send('docker:event', event, data),
  onDockerEvent: (callback: (event: string, data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, e: string, d: unknown) =>
      callback(e, d)
    ipcRenderer.on('docker:event', handler)
    return () => ipcRenderer.removeListener('docker:event', handler)
  },
})
