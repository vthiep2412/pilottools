import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

console.log('[singlefile] Building production bundle with Vite...')
execSync('bun run build', { stdio: 'inherit' })

const distDir = join(process.cwd(), 'dist')
const indexPath = join(distDir, 'index.html')

if (!existsSync(indexPath)) {
  console.error('[singlefile] Error: dist/index.html not found')
  process.exit(1)
}

let html = readFileSync(indexPath, 'utf-8')
const assetsDir = join(distDir, 'assets')

if (existsSync(assetsDir)) {
  const files = readdirSync(assetsDir)

  // Collect and inline CSS into head
  const cssFiles = files.filter((f) => f.endsWith('.css'))
  let combinedCss = ''
  for (const cssFile of cssFiles) {
    const cssContent = readFileSync(join(assetsDir, cssFile), 'utf-8')
    combinedCss += cssContent + '\n'
    const linkRegex = new RegExp(`<link[^>]*href=["'][^"']*${cssFile}["'][^>]*>`, 'gi')
    html = html.replace(linkRegex, '')
  }
  if (combinedCss) {
    html = html.replace('</head>', `<style>\n${combinedCss}</style>\n</head>`)
  }

  // Collect and inline JS right before closing body tag so #app element exists on mount
  const jsFiles = files.filter((f) => f.endsWith('.js'))
  let combinedJs = ''
  for (const jsFile of jsFiles) {
    let jsContent = readFileSync(join(assetsDir, jsFile), 'utf-8')
    jsContent = jsContent.replace(/<\/script>/gi, '<\\/script>')
    combinedJs += jsContent + '\n'
    const scriptRegex = new RegExp(`<script[^>]*src=["'][^"']*${jsFile}["'][^>]*>\\s*<\\/script>`, 'gi')
    html = html.replace(scriptRegex, '')
  }
  if (combinedJs) {
    html = html.replace('</body>', `<script>\n${combinedJs}</script>\n</body>`)
  }
}

// Strip out any redundant modulepreload links
html = html.replace(/<link[^>]*rel=["']modulepreload["'][^>]*>/gi, '')

const standalonePath = join(distDir, 'pilottools-standalone.html')
writeFileSync(standalonePath, html, 'utf-8')

console.log(`\n[singlefile] Standalone offline HTML created: ${standalonePath}`)
console.log(`[singlefile] File size: ${(Buffer.byteLength(html, 'utf-8') / 1024).toFixed(1)} KB`)
console.log('[singlefile] Done. File can be opened directly via double-click in any browser.\n')
