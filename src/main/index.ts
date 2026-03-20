import { app, shell, BrowserWindow, ipcMain, net, dialog, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { TorManager } from './torManager'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

// --- Debug logs for main process start ---
console.debug('[Main] Main process started')

const torManager = new TorManager()

function enableTorProxy(): void {
  console.debug('[Proxy] Enabling Tor proxy (socks5://127.0.0.1:9050)')
  session.defaultSession
    .setProxy({
      proxyRules: 'socks5://127.0.0.1:9050',
      proxyBypassRules: ''
    })
    .then(() => {
      console.log('[Proxy] Tor proxy enabled')
    })
    .catch((error) => {
      console.error('[Proxy] Failed to set Tor proxy:', error)
    })
}

function disableProxy(): void {
  console.debug('[Proxy] Disabling proxy (direct://)')
  session.defaultSession
    .setProxy({
      proxyRules: 'direct://'
    })
    .then(() => {
      console.log('[Proxy] Proxy disabled (direct connection)')
    })
    .catch((error) => {
      console.error('[Proxy] Failed to disable proxy:', error)
    })
}

torManager.onReady(() => {
  console.debug('[TorManager] Tor is ready, enabling proxy')
  enableTorProxy()
})
torManager.onStopped(() => {
  console.debug('[TorManager] Tor stopped, disabling proxy')
  disableProxy()
})

// Configure autoUpdater logging
autoUpdater.logger = log
log.transports.file.level = 'info'
autoUpdater.logger.info('Starting auto-updater')
app.commandLine.appendSwitch('--disable-webrtc')

autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'jsperry0807-rgb',
  repo: 'ShadowMesh',
  private: false
})

function createWindow(): BrowserWindow {
  console.debug('[Main] Creating BrowserWindow')
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
    console.debug('[Main] Window ready, showing')
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    console.debug('[Main] Opening external URL:', details.url)
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = process.env['ELECTRON_RENDERER_URL']
    console.debug('[Main] Loading dev renderer URL:', url)
    mainWindow.loadURL(url)
  } else {
    const file = join(__dirname, '../renderer/index.html')
    console.debug('[Main] Loading production file:', file)
    mainWindow.loadFile(file)
  }

  return mainWindow
}

app.whenReady().then(() => {
  console.debug('[Main] App ready')
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    console.debug('[Main] Browser window created')
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()

  // Auto-updater event handlers
  autoUpdater.on('checking-for-update', () => {
    console.debug('[AutoUpdater] Checking for updates...')
    console.log('Checking for updates...')
  })

  autoUpdater.on('update-available', (info) => {
    console.debug('[AutoUpdater] Update available:', info)
    console.log('Update available:', info)
    mainWindow.webContents.send('update-available', info)
  })

  autoUpdater.on('update-not-available', (info) => {
    console.debug('[AutoUpdater] Update not available:', info)
    console.log('Update not available:', info)
  })

  autoUpdater.on('error', (err) => {
    console.debug('[AutoUpdater] Update error:', err)
    console.error('Update error:', err)
  })

  autoUpdater.on('download-progress', (progressObj) => {
    console.debug(`[AutoUpdater] Download progress: ${progressObj.percent}%`)
    console.log(`Download speed: ${progressObj.bytesPerSecond} - ${progressObj.percent}%`)
    mainWindow.webContents.send('update-progress', progressObj)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.debug('[AutoUpdater] Update downloaded:', info)
    console.log('Update downloaded:', info)
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'A new version has been downloaded. Restart the application to install it?',
        buttons: ['Restart', 'Later']
      })
      .then((result) => {
        if (result.response === 0) {
          console.debug('[AutoUpdater] User chose to restart and install')
          autoUpdater.quitAndInstall()
        } else {
          console.debug('[AutoUpdater] User postponed update')
        }
      })
  })

  autoUpdater.checkForUpdatesAndNotify()
  console.debug('[AutoUpdater] Initial check for updates triggered')

  // IPC handlers for Tor control
  ipcMain.handle('tor-start', async (_event, { bridges, transport }) => {
    console.debug(
      '[IPC] tor-start called with bridges count:',
      bridges.length,
      'transport:',
      transport
    )
    const success = await torManager.start(bridges, transport)
    console.debug('[IPC] tor-start result:', success)
    return success
  })

  ipcMain.handle('tor-stop', () => {
    console.debug('[IPC] tor-stop called')
    torManager.stop()
  })

  ipcMain.handle('tor-status', async () => {
    const running = await torManager.isTorRunning()
    console.debug('[IPC] tor-status ->', running)
    return running
  })

  ipcMain.handle('test-tor', async () => {
    console.debug('[IPC] test-tor called')
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
            const result = JSON.parse(data)
            console.debug('[IPC] test-tor response:', result)
            resolve(result)
          } catch {
            console.debug('[IPC] test-tor invalid response')
            reject('Invalid response')
          }
        })
      })
      request.on('error', (error) => {
        console.debug('[IPC] test-tor error:', error.message)
        reject(error.message)
      })
      request.end()
    })
  })
})

app.on('window-all-closed', () => {
  console.debug('[Main] All windows closed')
  torManager.stop()
  if (process.platform !== 'darwin') {
    console.debug('[Main] Quitting app (not macOS)')
    app.quit()
  }
})

app.on('will-quit', () => {
  console.debug('[Main] App will quit, disabling proxy')
  disableProxy()
})
