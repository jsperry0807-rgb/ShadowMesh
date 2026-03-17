import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getTorStatus: () => Promise<boolean>
      stopTor: () => Promise<void>
      testTor: () => Promise<{ IsTor: boolean; IP: string }>
      startTor: (bridges: string[], transport: string) => Promise<boolean>
    }
  }
}
