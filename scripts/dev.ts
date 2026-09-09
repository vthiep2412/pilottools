import { spawn, ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const isExposeRequested = args.includes('--expose') || process.env.EXPOSE === '1'

function locateCloudflareBinary(): string | null {
  const localCandidates = [
    resolve(process.cwd(), 'cloudflared.exe'),
    resolve(process.cwd(), 'cloudflared'),
  ]

  for (const candidate of localCandidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

const activeProcesses: ChildProcess[] = []

function cleanup() {
  for (const proc of activeProcesses) {
    if (!proc.killed) {
      proc.kill()
    }
  }
}

process.on('SIGINT', () => {
  cleanup()
  process.exit(0)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})

process.on('exit', () => {
  cleanup()
})

async function run() {
  const viteCmd = process.platform === 'win32' ? 'bun.exe' : 'bun'
  const viteProcess = spawn(viteCmd, ['x', 'vite'], {
    stdio: 'inherit',
    shell: true,
  })
  activeProcesses.push(viteProcess)

  viteProcess.on('exit', (code) => {
    cleanup()
    process.exit(code ?? 0)
  })

  if (!isExposeRequested) {
    return
  }

  const cloudflaredBin = locateCloudflareBinary()

  if (!cloudflaredBin) {
    console.log('\n[tunnel] Notice: cloudflared.exe not found in workspace directory. Skipping tunnel.\n')
    return
  }

  console.log(`\n[tunnel] Starting Cloudflare tunnel using ${cloudflaredBin}...\n`)

  const tunnelProcess = spawn(
    cloudflaredBin,
    ['tunnel', '--url', 'http://localhost:5173'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    }
  )
  activeProcesses.push(tunnelProcess)

  const handleTunnelOutput = (chunk: Buffer) => {
    const text = chunk.toString()
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)
    if (match) {
      console.log('\n======================================================')
      console.log(`[tunnel] Public URL: ${match[0]}`)
      console.log('======================================================\n')
    }
  }

  tunnelProcess.stdout?.on('data', handleTunnelOutput)
  tunnelProcess.stderr?.on('data', handleTunnelOutput)

  tunnelProcess.on('error', (err) => {
    console.error(`[tunnel] Failed to start cloudflared: ${err.message}`)
  })
}

run()
