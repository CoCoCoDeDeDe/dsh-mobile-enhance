#!/usr/bin/env node
/**
 * Allow the PWA assets through dsh-pocket's access-PIN gate.
 *
 * Chrome fetches the Web App Manifest and its icons without the access-PIN
 * cookie, so dsh-pocket's auth gate answers them with 401. Chrome then parses an
 * empty manifest and never offers installation. This patch exempts
 * `/dme/*` and `/dme-sw.js` from the PIN check (the page and the DSH API still
 * require it).
 *
 * dsh-pocket is installed per profile and is replaced on upgrade, so this script
 * is idempotent: run it again after `dsh plugin update dsh-pocket`.
 *
 * Usage:
 *   node scripts/patch-dsh-pocket.mjs [path/to/dsh-pocket/lib/proxy.mjs]
 *
 * The default path is `$DSH_HOME/profiles/web/node_modules/dsh-pocket/lib/proxy.mjs`.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const defaultTarget = join(
  process.env.DSH_HOME || join(homedir(), '.dsh'),
  'profiles',
  'web',
  'node_modules',
  'dsh-pocket',
  'lib',
  'proxy.mjs',
)
const target = process.argv[2] || defaultTarget

if (!existsSync(target)) {
  console.error(`dsh-pocket proxy not found: ${target}`)
  console.error('Install dsh-pocket into the web profile first, or pass the proxy.mjs path explicitly.')
  process.exit(1)
}

let source = readFileSync(target, 'utf8')

if (source.includes('const isPwaAsset = pwaPath.startsWith')) {
  console.log(`already patched: ${target}`)
  process.exit(0)
}

const createServerMarker = 'const server = createServer((req, res) => {'
const upgradeMarker = "server.on('upgrade'"
const httpStart = source.indexOf(createServerMarker)
const wsStart = source.indexOf(upgradeMarker)

if (httpStart < 0 || wsStart < 0 || wsStart <= httpStart) {
  console.error('unexpected dsh-pocket proxy layout: createServer/upgrade markers not found')
  process.exit(2)
}

let segment = source.slice(httpStart, wsStart)

const isPublicLine = "const isPublic = classifyHost(host) === 'public';"
if (!segment.includes(isPublicLine)) {
  console.error('unexpected dsh-pocket proxy layout: isPublic line not found in the HTTP handler')
  process.exit(3)
}

const pwaInsert = `${isPublicLine}
    // PWA assets (manifest, icons, service worker) are fetched by the browser
    // without the access-PIN cookie; exempt them from the auth gate below.
    const pwaPath = (() => {
      try {
        return new URL(req.url || '/', 'http://dsh.invalid').pathname;
      } catch {
        return '';
      }
    })();
    const isPwaAsset = pwaPath.startsWith('/dme/') || pwaPath === '/dme-sw.js';`

segment = segment.replace(isPublicLine, pwaInsert)

const authMarker = 'if (auth) {'
if (!segment.includes(authMarker)) {
  console.error('unexpected dsh-pocket proxy layout: auth gate not found in the HTTP handler')
  process.exit(4)
}
segment = segment.replace(authMarker, 'if (auth && !isPwaAsset) {')

copyFileSync(target, `${target}.dme-bak`)
source = source.slice(0, httpStart) + segment + source.slice(wsStart)
writeFileSync(target, source)
console.log(`patched: ${target}`)
console.log(`backup:  ${target}.dme-bak`)
