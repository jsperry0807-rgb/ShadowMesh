import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

console.log('✅ Preload script executing...')
console.debug('[Preload] Script started, contextIsolated =', process.contextIsolated)

// Custom APIs for renderer
const api = {
  startTor: (bridges: string[], transport: string) => {
    console.debug(
      '[Preload] startTor called with bridges count:',
      bridges.length,
      'transport:',
      transport
    )
    return ipcRenderer.invoke('tor-start', { bridges, transport })
  },
  stopTor: () => {
    console.debug('[Preload] stopTor called')
    return ipcRenderer.invoke('tor-stop')
  },
  getTorStatus: () => {
    console.debug('[Preload] getTorStatus called')
    return ipcRenderer.invoke('tor-status')
  },
  testTor: () => {
    console.debug('[Preload] testTor called')
    return ipcRenderer.invoke('test-tor')
  }
}

if (process.contextIsolated) {
  console.debug('[Preload] contextIsolated = true, exposing via contextBridge')
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    console.debug('[Preload] Successfully exposed electron and api to main world')
  } catch (error) {
    console.error('[Preload] Failed to expose APIs via contextBridge:', error)
  }
} else {
  console.debug('[Preload] contextIsolated = false, using direct window assignment')
  // @ts-ignore will not know
  window.electron = electronAPI
  // @ts-ignore will not know
  window.api = api
  console.debug('[Preload] Successfully assigned electron and api to window')
}
