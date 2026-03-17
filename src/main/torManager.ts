import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import net from 'net'

export class TorManager {
  private process: ChildProcess | null = null
  private port: number = 9050
  private torDataDir: string | null = null
  private torrcPath: string | null = null

  // Get platform subfolder name (e.g., 'win', 'mac', 'linux')
  private getPlatformFolder(): string {
    switch (process.platform) {
      case 'win32':
        return 'win'
      case 'darwin':
        return 'mac'
      case 'linux':
        return 'linux'
      default:
        throw new Error(`Unsupported platform: ${process.platform}`)
    }
  }

  // Helper to locate resources inside the packaged app
  private getResourcePath(subdir: string): string {
    const isDev = process.env.NODE_ENV === 'development'
    if (isDev) {
      // In development, resources are at the project root
      return path.join(process.cwd(), 'resources', subdir)
    } else {
      // In production, resources are inside the app's resources directory
      return path.join(process.resourcesPath, subdir)
    }
  }

  private getTorBinaryPath(): string {
    const torBaseDir = this.getResourcePath('tor')
    const platformFolder = this.getPlatformFolder()
    const binaryName = process.platform === 'win32' ? 'tor.exe' : 'tor'
    return path.join(torBaseDir, platformFolder, binaryName)
  }

  // Map friendly transport name to actual binary name (without extension)
  private getTransportBinaryName(transport: string): string {
    switch (transport) {
      case 'obfs4':
      case 'lyrebird':
        return 'lyrebird'
      case 'snowflake':
        return 'snowflake-client' // adjust if your binary is named differently
      default:
        return transport
    }
  }

  private getPluggableTransportPath(transport: string): string {
    const torBaseDir = this.getResourcePath('tor')
    const platformFolder = this.getPlatformFolder()
    const binaryBaseName = this.getTransportBinaryName(transport)
    const binaryName = process.platform === 'win32' ? `${binaryBaseName}.exe` : binaryBaseName
    // Add 'pluggable_transports' subfolder
    return path.join(torBaseDir, platformFolder, 'pluggable_transports', binaryName)
  }

  // Check if Tor is already listening on the SOCKS port
  public async isTorRunning(port: number = this.port): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection(port, '127.0.0.1', () => {
        socket.end()
        resolve(true)
      })
      socket.on('error', () => resolve(false))
    })
  }

  // Generate a torrc file with bridges and pluggable transport settings
  private async generateTorrc(
    bridges: string[] = [],
    transport: string = 'obfs4'
  ): Promise<string> {
    const userDataDir = process.env.APPDATA || process.env.HOME || path.join(__dirname, '..')
    const baseDir = path.join(userDataDir, '.myapp-tor')

    // Ensure base directory exists (async, no need to check first)
    await fs.promises.mkdir(baseDir, { recursive: true })

    this.torDataDir = path.join(baseDir, 'data')
    await fs.promises.mkdir(this.torDataDir, { recursive: true })

    this.torrcPath = path.join(baseDir, 'torrc')

    const transportPath = this.getPluggableTransportPath(transport)
    try {
      await fs.promises.access(transportPath, fs.constants.F_OK)
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

  // Start Tor with the given bridges and transport
  public async start(bridges: string[] = [], transport: string = 'obfs4'): Promise<boolean> {
    if (await this.isTorRunning()) {
      console.log('Tor already running')
      return true
    }

    const torPath = this.getTorBinaryPath()
    if (!fs.existsSync(torPath)) {
      console.error('Tor binary not found at', torPath)
      return false
    }

    // Await the async torrc generation
    const torrcPath = await this.generateTorrc(bridges, transport)

    const args = ['-f', torrcPath]
    console.log('Spawning Tor:', torPath, args.join(' '))

    this.process = spawn(torPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    // Use optional chaining to avoid null errors
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

    // Wait for Tor to be ready
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

  public stop(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }
}
