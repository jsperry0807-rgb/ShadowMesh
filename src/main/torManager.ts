import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import net from 'net'
import { app } from 'electron'
import * as tar from 'tar'
import * as https from 'https'

// --------------------------------------------------------------------------
// Types for tor-versions JSON response
// --------------------------------------------------------------------------
interface TorVersionFile {
  file_name: string
  url: string
}

interface TorVersionEntry {
  version: string
  files: TorVersionFile[]
}

// Simplified type for the grouped JSON
type TorVersionsData = Record<string, TorVersionEntry[] | TorVersionFile[]>

export class TorManager {
  private process: ChildProcess | null = null
  private port: number
  private torDataDir: string | null = null
  private torrcPath: string | null = null

  // Paths inside user data directory (writable)
  private userDataPath: string
  private torBaseDir: string
  private torBinDir: string
  private torBinaryPath: string
  private ptDir: string

  private onReadyCallback: (() => void) | null = null
  private onStoppedCallback: (() => void) | null = null

  constructor(port: number = 9050) {
    this.port = port
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
  // Version comparison utilities
  // --------------------------------------------------------------------------
  private parseVersion(ver: string): number[] {
    return ver.split('.').map(Number)
  }

  private isVersionGreaterOrEqual(a: string, b: string): boolean {
    const aParts = this.parseVersion(a)
    const bParts = this.parseVersion(b)
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aNum = aParts[i] || 0
      const bNum = bParts[i] || 0
      if (aNum > bNum) return true
      if (aNum < bNum) return false
    }
    return true // equal
  }

  // --------------------------------------------------------------------------
  // Fetch latest Tor version info from tor-versions
  // --------------------------------------------------------------------------
  private async fetchLatestTorInfo(): Promise<{ version: string; url: string; fileName: string }> {
    const url =
      'https://raw.githubusercontent.com/QudsLab/tor-versions/main/data/json/export_versions_grouped.json'
    const response = await this.httpsGet(url)
    const data = JSON.parse(response) as TorVersionsData

    const platformKey = this.getPlatformKey()
    const platformEntries = data[platformKey]
    if (!platformEntries) {
      throw new Error(`No data for platform key: ${platformKey}`)
    }

    // Case 1: array of version objects with 'files' array
    if (
      Array.isArray(platformEntries) &&
      platformEntries.length > 0 &&
      'files' in platformEntries[0]
    ) {
      const typedEntries = platformEntries as TorVersionEntry[]
      const candidates = typedEntries
        .filter((entry) => entry.files && Array.isArray(entry.files))
        .map((entry) => {
          const file = entry.files.find(
            (f) =>
              f.file_name && (f.file_name.endsWith('.tar.gz') || f.file_name.endsWith('.tar.xz'))
          )
          return file ? { version: entry.version, url: file.url, fileName: file.file_name } : null
        })
        .filter((item): item is { version: string; url: string; fileName: string } => item !== null)

      if (candidates.length === 0) {
        throw new Error('No downloadable file found in version entries')
      }
      // Sort by version descending (latest first)
      candidates.sort((a, b) => (this.isVersionGreaterOrEqual(a.version, b.version) ? -1 : 1))
      return candidates[0]
    }

    // Case 2: array of file objects directly
    if (
      Array.isArray(platformEntries) &&
      platformEntries.length > 0 &&
      'file_name' in platformEntries[0]
    ) {
      const typedFiles = platformEntries as TorVersionFile[]
      const candidates = typedFiles
        .filter(
          (f) => f.file_name && (f.file_name.endsWith('.tar.gz') || f.file_name.endsWith('.tar.xz'))
        )
        .map((f) => {
          // Try to extract version from filename (e.g., tor-win64-0.4.8.11.tar.gz)
          const match = f.file_name.match(/(\d+\.\d+\.\d+(?:\.\d+)?(?:[a-z][0-9]+)?)/)
          const version = match ? match[1] : '0.0.0.0'
          return { version, url: f.url, fileName: f.file_name }
        })

      if (candidates.length === 0) {
        throw new Error('No .tar.gz/.tar.xz file found in platform entries')
      }
      candidates.sort((a, b) => (this.isVersionGreaterOrEqual(a.version, b.version) ? -1 : 1))
      return candidates[0]
    }

    throw new Error(`Unrecognized data format for platform: ${platformKey}`)
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
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath)
      https
        .get(url, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed with status ${res.statusCode}`))
            return
          }
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
  // Pluggable Transport download (minimal implementation for lyrebird)
  // --------------------------------------------------------------------------
  private async ensurePluggableTransport(transport: string): Promise<void> {
    const transportPath = this.getPluggableTransportPath(transport)
    try {
      await fs.promises.access(transportPath, fs.constants.X_OK)
      return // already exists and executable
    } catch {
      // Not found – download it
      console.log(`Pluggable transport binary for ${transport} not found, downloading...`)
    }

    // Only lyrebird (obfs4) is implemented here. For other transports, you would need similar logic.
    if (transport !== 'obfs4' && transport !== 'lyrebird') {
      throw new Error(`Automatic download not implemented for transport: ${transport}`)
    }

    const baseUrl = 'https://github.com/Pluggable-Transports/lyrebird/releases/download/v0.3.0'
    let fileName: string
    if (process.platform === 'win32') {
      fileName = process.arch === 'x64' ? 'lyrebird-windows-amd64.exe' : 'lyrebird-windows-386.exe'
    } else if (process.platform === 'darwin') {
      fileName = 'lyrebird-darwin-amd64' // adjust for arm64 if needed
    } else if (process.platform === 'linux') {
      fileName = process.arch === 'x64' ? 'lyrebird-linux-amd64' : 'lyrebird-linux-386'
    } else {
      throw new Error(`Unsupported platform for lyrebird: ${process.platform}`)
    }

    const url = `${baseUrl}/${fileName}`
    const destPath = transportPath // use the full path with correct name

    await this.downloadFile(url, destPath)
    if (process.platform !== 'win32') {
      await fs.promises.chmod(destPath, 0o755)
    }
    console.log(`Pluggable transport ${transport} downloaded to ${destPath}`)
  }

  // --------------------------------------------------------------------------
  // Ensure Tor is installed (download if missing)
  // --------------------------------------------------------------------------
  public async ensureTorInstalled(): Promise<boolean> {
    // Check if binary already exists and is executable
    try {
      await fs.promises.access(this.torBinaryPath, fs.constants.X_OK)
      console.log('Tor binary found at', this.torBinaryPath)
      return true
    } catch {
      console.log('Tor binary not found. Starting download...')
    }

    try {
      // Ensure directories exist
      await fs.promises.mkdir(this.torBinDir, { recursive: true })
      await fs.promises.mkdir(this.ptDir, { recursive: true })

      // Obtain Tor download info
      let torInfo
      try {
        torInfo = await this.fetchLatestTorInfo()
      } catch (error) {
        console.warn('Failed to fetch latest Tor info, using fallback URL:', error)
        torInfo = this.getFallbackTorInfo()
      }

      // Download archive
      console.log(`Downloading Tor version ${torInfo.version} from ${torInfo.url}...`)
      const archivePath = path.join(this.torBaseDir, torInfo.fileName)
      await this.downloadFile(torInfo.url, archivePath)

      // Extract archive
      console.log('Extracting Tor Expert Bundle...')
      await tar.x({
        file: archivePath,
        cwd: this.torBaseDir,
        strip: 1 // remove the top-level directory
      })

      // Delete archive
      await fs.promises.unlink(archivePath)

      // Verify binary is at expected location; if not, search and move it
      try {
        await fs.promises.access(this.torBinaryPath, fs.constants.X_OK)
        console.log('Tor binary found at expected location after extraction')
      } catch {
        console.log('Tor binary not found at expected path, searching...')
        const moved = await this.findAndMoveTorBinary()
        if (!moved) {
          throw new Error('Could not locate tor executable in extracted bundle')
        }
      }

      // Final verification
      await fs.promises.access(this.torBinaryPath, fs.constants.X_OK)
      console.log('Tor installed successfully')
      return true
    } catch (error) {
      console.error('Failed to install Tor:', error)
      return false
    }
  }

  private getFallbackTorInfo(): { version: string; url: string; fileName: string } {
    // Use a known stable version – update these periodically
    const torVersion = '0.4.8.13'
    const torbrowserVersion = '13.5.6'

    if (process.platform === 'win32') {
      const fileName =
        process.arch === 'x64' ? `tor-win64-${torVersion}.tar.gz` : `tor-win32-${torVersion}.tar.gz`
      return {
        version: torVersion,
        url: `https://archive.torproject.org/tor-package-archive/torbrowser/${torbrowserVersion}/${fileName}`,
        fileName
      }
    } else if (process.platform === 'darwin') {
      const fileName = `tor-macos-${torVersion}.tar.gz`
      return {
        version: torVersion,
        url: `https://archive.torproject.org/tor-package-archive/torbrowser/${torbrowserVersion}/${fileName}`,
        fileName
      }
    } else if (process.platform === 'linux') {
      const fileName =
        process.arch === 'x64'
          ? `tor-linux64-${torVersion}.tar.gz`
          : `tor-linux32-${torVersion}.tar.gz`
      return {
        version: torVersion,
        url: `https://archive.torproject.org/tor-package-archive/torbrowser/${torbrowserVersion}/${fileName}`,
        fileName
      }
    } else {
      throw new Error(`Unsupported platform for fallback: ${process.platform}`)
    }
  }

  // --------------------------------------------------------------------------
  // Search for tor binary inside torBaseDir and move it to torBinDir
  // --------------------------------------------------------------------------
  private async findFile(dir: string, fileName: string): Promise<string | null> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile() && entry.name === fileName) {
        return fullPath
      }
      if (entry.isDirectory()) {
        const found = await this.findFile(fullPath, fileName)
        if (found) return found
      }
    }
    return null
  }

  private async findAndMoveTorBinary(): Promise<boolean> {
    const binaryName = this.getTorBinaryName()
    const foundPath = await this.findFile(this.torBaseDir, binaryName)
    if (!foundPath) {
      console.error(`Could not find ${binaryName} anywhere under ${this.torBaseDir}`)
      return false
    }

    // Ensure target directory exists
    await fs.promises.mkdir(this.torBinDir, { recursive: true })
    // Move the binary
    await fs.promises.rename(foundPath, this.torBinaryPath)
    // Set executable permissions (not needed on Windows)
    if (process.platform !== 'win32') {
      await fs.promises.chmod(this.torBinaryPath, 0o755)
    }
    console.log(`Moved ${binaryName} from ${foundPath} to ${this.torBinaryPath}`)
    return true
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

  private async findGeoIPFiles(): Promise<{ geoip: string; geoip6: string } | null> {
    const possiblePaths = [
      path.join(this.torBaseDir, 'Data', 'Tor', 'geoip'),
      path.join(this.torBaseDir, 'share', 'tor', 'geoip'),
      path.join(this.torBaseDir, 'geoip')
    ]
    let geoip: string | undefined
    let geoip6: string | undefined
    for (const p of possiblePaths) {
      try {
        await fs.promises.access(p)
        geoip = p
        break
      } catch {
        /* not here */
      }
    }
    for (const p of possiblePaths.map((p) => p + '6')) {
      try {
        await fs.promises.access(p)
        geoip6 = p
        break
      } catch {
        /* not here */
      }
    }
    if (geoip && geoip6) return { geoip, geoip6 }
    return null
  }

  // --------------------------------------------------------------------------
  // Generate torrc file with bridges and pluggable transport settings
  // --------------------------------------------------------------------------
  private async generateTorrc(
    bridges: string[] = [],
    transport: string = 'obfs4'
  ): Promise<string> {
    // Ensure pluggable transport is present
    await this.ensurePluggableTransport(transport)

    const baseDir = path.join(this.userDataPath, '.myapp-tor')
    await fs.promises.mkdir(baseDir, { recursive: true })

    this.torDataDir = path.join(baseDir, 'data')
    await fs.promises.mkdir(this.torDataDir, { recursive: true })

    this.torrcPath = path.join(baseDir, 'torrc')

    const transportPath = this.getPluggableTransportPath(transport)
    // Already checked in ensurePluggableTransport, but double-check
    try {
      await fs.promises.access(transportPath, fs.constants.X_OK)
    } catch {
      throw new Error(`Pluggable transport binary not found or not executable: ${transportPath}`)
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
    const geoFiles = await this.findGeoIPFiles()
    if (geoFiles) {
      torrc += `GeoIPFile ${geoFiles.geoip}\n`
      torrc += `GeoIPv6File ${geoFiles.geoip6}\n`
    }

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
      throw new Error('Tor installation failed, cannot start.')
    }

    if (await this.isTorRunning(this.port)) {
      console.log('Tor already running')
      this.onReadyCallback?.()
      return true
    }

    const torrcPath = await this.generateTorrc(bridges, transport)

    return new Promise((resolve, reject) => {
      this.process = spawn(this.torBinaryPath, ['-f', torrcPath], {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stderrData = ''

      this.process.stdout?.on('data', (data) => {
        console.log(`[Tor] ${data}`)
      })

      this.process.stderr?.on('data', (data) => {
        stderrData += data
        console.error(`[Tor error] ${data}`)
      })

      this.process.on('error', (err) => {
        reject(new Error(`Failed to spawn Tor: ${err.message}`))
      })

      this.process.on('close', (code) => {
        this.process = null
        if (code !== 0) {
          reject(new Error(`Tor exited with code ${code}: ${stderrData}`))
        } else {
          // Normal exit (shouldn't happen if we resolved earlier)
          this.onStoppedCallback?.()
        }
      })

      // Wait for SOCKS port to be ready
      const checkInterval = setInterval(async () => {
        if (await this.isTorRunning(this.port)) {
          clearInterval(checkInterval)
          clearTimeout(timeout)
          this.onReadyCallback?.()
          resolve(true)
        }
      }, 500)

      const timeout = setTimeout(() => {
        clearInterval(checkInterval)
        this.process?.kill() // Kill if still running
        reject(new Error('Tor startup timeout after 120s'))
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
    this.onStoppedCallback?.()
  }

  // --------------------------------------------------------------------------
  // Event handlers
  // --------------------------------------------------------------------------
  public onReady(callback: () => void): void {
    this.onReadyCallback = callback
  }

  public onStopped(callback: () => void): void {
    this.onStoppedCallback = callback
  }
}
