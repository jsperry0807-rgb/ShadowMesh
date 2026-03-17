import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import net from 'net'
import { app } from 'electron'
import * as tar from 'tar'
import * as https from 'https'

// Types for tor-versions JSON response
interface TorVersionFile {
  file_name: string
  url: string
}

interface TorVersionEntry {
  version: string
  files: TorVersionFile[]
}

export class TorManager {
  private process: ChildProcess | null = null
  private port: number = 9050
  private torDataDir: string | null = null
  private torrcPath: string | null = null

  // Paths inside user data directory (writable)
  private userDataPath: string
  private torBaseDir: string
  private torBinDir: string
  private torBinaryPath: string
  private ptDir: string

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.torBaseDir = path.join(this.userDataPath, 'tor')
    this.torBinDir = path.join(this.torBaseDir, 'bin')
    this.torBinaryPath = path.join(this.torBinDir, this.getTorBinaryName())
    this.ptDir = path.join(this.torBaseDir, 'pluggable_transports')
  }

  // --------------------------------------------------------------------------
  // Platform helpers
  // --------------------------------------------------------------------------
  private getTorBinaryName(): string {
    return process.platform === 'win32' ? 'tor.exe' : 'tor'
  }

  private getPlatformKey(): string {
    switch (process.platform) {
      case 'win32':
        return 'windows'
      case 'darwin':
        return 'macos'
      case 'linux':
        return 'linux'
      default:
        throw new Error(`Unsupported platform: ${process.platform}`)
    }
  }

  private getTransportBinaryName(transport: string): string {
    switch (transport) {
      case 'obfs4':
      case 'lyrebird':
        return 'lyrebird'
      case 'snowflake':
        return 'snowflake-client'
      default:
        return transport
    }
  }

  private getPluggableTransportPath(transport: string): string {
    const binaryBaseName = this.getTransportBinaryName(transport)
    const binaryName = process.platform === 'win32' ? `${binaryBaseName}.exe` : binaryBaseName
    return path.join(this.ptDir, binaryName)
  }

  // --------------------------------------------------------------------------
  // Fetch latest Tor version info from tor-versions
  // --------------------------------------------------------------------------
  private async fetchLatestTorInfo(): Promise<{ version: string; url: string; fileName: string }> {
    const url =
      'https://raw.githubusercontent.com/QudsLab/tor-versions/main/data/json/export_versions_grouped.json'
    const response = await this.httpsGet(url)
    const data = JSON.parse(response) as Record<string, TorVersionEntry[]>

    const platformKey = this.getPlatformKey()
    const platformFiles = data[platformKey]
    if (!platformFiles || platformFiles.length === 0) {
      throw new Error(`No Tor downloads found for platform: ${platformKey}`)
    }

    // The first entry is typically the latest version
    const latestVersion = platformFiles[0]
    // Find the appropriate file (usually .tar.gz for Windows/macOS, .tar.xz for Linux)
    const downloadFile = latestVersion.files.find(
      (f) => f.file_name.endsWith('.tar.gz') || f.file_name.endsWith('.tar.xz')
    )
    if (!downloadFile) {
      throw new Error('No downloadable file found for latest version')
    }

    return {
      version: latestVersion.version,
      url: downloadFile.url,
      fileName: downloadFile.file_name
    }
  }

  private httpsGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => resolve(data))
        })
        .on('error', reject)
    })
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath)
      https
        .get(url, (res) => {
          res.pipe(file)
          file.on('finish', () => {
            file.close()
            resolve()
          })
        })
        .on('error', (err) => {
          fs.unlink(destPath, () => reject(err))
        })
    })
  }

  // --------------------------------------------------------------------------
  // Ensure Tor is installed (download if missing)
  // --------------------------------------------------------------------------
  public async ensureTorInstalled(): Promise<boolean> {
    try {
      await fs.promises.access(this.torBinaryPath, fs.constants.X_OK)
      console.log('Tor binary found at', this.torBinaryPath)
      return true
    } catch {
      console.log('Tor binary not found. Starting download...')
    }

    try {
      await fs.promises.mkdir(this.torBinDir, { recursive: true })
      await fs.promises.mkdir(this.ptDir, { recursive: true })

      const torInfo = await this.fetchLatestTorInfo()
      console.log(`Latest Tor version: ${torInfo.version}`)

      const archivePath = path.join(this.torBaseDir, torInfo.fileName)
      console.log(`Downloading from ${torInfo.url}...`)
      await this.downloadFile(torInfo.url, archivePath)

      console.log('Extracting Tor Expert Bundle...')
      await tar.x({
        file: archivePath,
        cwd: this.torBaseDir,
        strip: 1
      })

      await fs.promises.unlink(archivePath)
      await fs.promises.access(this.torBinaryPath, fs.constants.X_OK)
      console.log('Tor installed successfully')
      return true
    } catch (error) {
      console.error('Failed to install Tor:', error)
      return false
    }
  }

  // --------------------------------------------------------------------------
  // Check if Tor is already running on the SOCKS port
  // --------------------------------------------------------------------------
  public async isTorRunning(port: number = this.port): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection(port, '127.0.0.1', () => {
        socket.end()
        resolve(true)
      })
      socket.on('error', () => resolve(false))
    })
  }

  // --------------------------------------------------------------------------
  // Generate torrc file with bridges and pluggable transport settings
  // --------------------------------------------------------------------------
  private async generateTorrc(
    bridges: string[] = [],
    transport: string = 'obfs4'
  ): Promise<string> {
    const baseDir = path.join(this.userDataPath, '.myapp-tor')
    await fs.promises.mkdir(baseDir, { recursive: true })

    this.torDataDir = path.join(baseDir, 'data')
    await fs.promises.mkdir(this.torDataDir, { recursive: true })

    this.torrcPath = path.join(baseDir, 'torrc')

    const transportPath = this.getPluggableTransportPath(transport)
    try {
      await fs.promises.access(transportPath, fs.constants.X_OK)
    } catch {
      throw new Error(`Pluggable transport binary not found: ${transportPath}`)
    }

    let torrc = `
# Auto-generated torrc
SOCKSPort ${this.port}
DataDirectory ${this.torDataDir}
Log notice stdout
SafeLogging 1
TruncateLogFile 1

# Pluggable transport
ClientTransportPlugin ${transport} exec ${transportPath}
UseBridges 1
`

    if (bridges.length === 0) {
      torrc += `# No bridges provided – you will not be able to connect\n`
    } else {
      bridges.forEach((line) => (torrc += `Bridge ${line}\n`))
    }

    await fs.promises.writeFile(this.torrcPath, torrc, 'utf8')
    return this.torrcPath
  }

  // --------------------------------------------------------------------------
  // Start Tor
  // --------------------------------------------------------------------------
  public async start(bridges: string[] = [], transport: string = 'obfs4'): Promise<boolean> {
    const installed = await this.ensureTorInstalled()
    if (!installed) {
      console.error('Tor installation failed, cannot start.')
      return false
    }

    if (await this.isTorRunning()) {
      console.log('Tor already running')
      return true
    }

    const torrcPath = await this.generateTorrc(bridges, transport)

    const args = ['-f', torrcPath]
    console.log('Spawning Tor:', this.torBinaryPath, args.join(' '))

    this.process = spawn(this.torBinaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    this.process.stdout?.on('data', (data) => {
      console.log(`[Tor] ${data}`)
    })

    this.process.stderr?.on('data', (data) => {
      console.error(`[Tor error] ${data}`)
    })

    this.process.on('close', (code) => {
      console.log(`Tor process exited with code ${code}`)
      this.process = null
    })

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        if (await this.isTorRunning()) {
          clearInterval(interval)
          console.log('Tor is ready.')
          resolve(true)
        }
      }, 500)
      setTimeout(() => {
        clearInterval(interval)
        console.error('Tor startup timeout')
        resolve(false)
      }, 120000)
    })
  }

  // --------------------------------------------------------------------------
  // Stop Tor
  // --------------------------------------------------------------------------
  public stop(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }
}
