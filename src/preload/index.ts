import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

console.log('✅ Preload script executing...')

// Custom APIs for renderer
const api = {
  startTor: (bridges: string[], transport: string) =>
    ipcRenderer.invoke('tor-start', { bridges, transport }),
  stopTor: () => ipcRenderer.invoke('tor-stop'),
  getTorStatus: () => ipcRenderer.invoke('tor-status'),
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
