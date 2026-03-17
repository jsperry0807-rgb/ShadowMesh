import { app, shell, BrowserWindow, ipcMain, net } from 'electron' // ← add net
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { TorManager } from './torManager'

const torManager = new TorManager()

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Set proxy for all HTTP/HTTPS requests from the renderer
  app.commandLine.appendSwitch('proxy-server', 'socks5://127.0.0.1:9050')
  console.log('Proxy set to:', app.commandLine.getSwitchValue('proxy-server'))

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC handlers for Tor control
  ipcMain.handle('tor-start', async (_event, { bridges, transport }) => {
    return await torManager.start(bridges, transport)
  })

  ipcMain.handle('tor-stop', () => {
    torManager.stop()
  })

  ipcMain.handle('tor-status', async () => {
    return await torManager.isTorRunning()
  })

  // NEW: Test Tor connection using main process networking (respects proxy)
  ipcMain.handle('test-tor', async () => {
    return new Promise((resolve, reject) => {
      const request = net.request({
        url: 'https://check.torproject.org/api/ip',
        useSessionCookies: false
      })
      request.on('response', (response) => {
        let data = ''
        response.on('data', (chunk) => (data += chunk))
        response.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            reject('Invalid response')
          }
        })
      })
      request.on('error', (error) => reject(error.message))
      request.end()
    })
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  torManager.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
