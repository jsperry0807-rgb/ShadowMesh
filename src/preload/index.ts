import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

console.log('✅ Preload script executing...')

// Custom APIs for renderer
const api = {
  // Start Tor with optional bridges and transport
  startTor: (bridges: string[], transport: string) =>
    ipcRenderer.invoke('tor-start', { bridges, transport }),
  // Stop the Tor process
  stopTor: () => ipcRenderer.invoke('tor-stop'),
  // Check if Tor is running
  getTorStatus: () => ipcRenderer.invoke('tor-status'),
  // NEW: Test Tor connection via main process
  testTor: () => ipcRenderer.invoke('test-tor')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore will not know
  window.electron = electronAPI
  // @ts-ignore will not know
  window.api = api
}
