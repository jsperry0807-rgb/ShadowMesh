import { app, shell, BrowserWindow, ipcMain, net, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { TorManager } from './torManager'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log' // Use ES import instead of require()

const torManager = new TorManager()

// Configure autoUpdater logging
autoUpdater.logger = log // Assign the logger (fixes ESLint require rule)
log.transports.file.level = 'info' // Directly use log.transports (TypeScript may still complain – see note below)
autoUpdater.logger.info('Starting auto-updater')

// Set the GitHub release feed – REPLACE 'your-username' WITH THE ACTUAL OWNER
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'your-username',
  repo: 'fithub',
  private: false // set to true if the repository is private
})

// Corrected: return the created BrowserWindow
function createWindow(): BrowserWindow {
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

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  // Set Tor SOCKS proxy
  app.commandLine.appendSwitch('proxy-server', 'socks5://127.0.0.1:9050')
  console.log('Proxy set to:', app.commandLine.getSwitchValue('proxy-server'))

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create the main window and keep a reference (now correctly typed)
  const mainWindow = createWindow()

  // --- Auto-updater event handlers ---
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info)
    mainWindow.webContents.send('update-available', info)
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available:', info)
  })

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err)
  })

  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`Download speed: ${progressObj.bytesPerSecond} - ${progressObj.percent}%`)
    mainWindow.webContents.send('update-progress', progressObj)
  })

  autoUpdater.on('update-downloaded', (info) => {
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
          autoUpdater.quitAndInstall()
        }
      })
  })

  // Check for updates now
  autoUpdater.checkForUpdatesAndNotify()

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
})

app.on('window-all-closed', () => {
  torManager.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
