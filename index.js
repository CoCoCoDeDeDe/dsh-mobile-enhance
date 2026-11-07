/**
 * dsh-mobile-enhance — Host half.
 *
 * A mobile-experience layer for the DeepSeek Harness Web UI. It contributes no
 * new UI of its own; it extends the served index and the browser runtime so the
 * existing Web GUI behaves better on a phone:
 *
 * - PWA: serves a pass-through service worker plus a manifest that points at the
 *   bundled SVG icon, so Chrome offers "Install app" instead of only a shortcut.
 * - Keyboard: rewrites the viewport meta with `interactive-widget=resizes-content`
 *   and exposes the on-screen keyboard inset as `--dme-kb` for CSS.
 * - Gallery: on coarse-pointer devices, patches `HTMLInputElement.prototype.click`
 *   so the composer's bare file input opens the system photo picker with
 *   multi-select instead of the document picker.
 *
 * Everything is served through the harness webServer, so it also works behind
 * dsh-pocket (the proxy rewrites Host/Origin but forwards these paths unchanged).
 */

/** Services this plugin needs before it may activate. */
export const inject = ['webServer']

const PREFIX = '/dme'
const SW_PATH = '/dme-sw.js'
const MANIFEST_PATH = `${PREFIX}/manifest.webmanifest`
const ICON_PATH = `${PREFIX}/icon.svg`

/**
 * The manifest is intentionally minimal: `display: fullscreen` keeps the browser
 * chrome out of the way after installation, and the SVG icon is the MVP asset.
 * Chrome may still require a 192/512 PNG before it offers installation; when
 * that happens, add PNGs under assets/ and extend this icon list.
 */
const MANIFEST = {
  name: 'DeepSeek Harness',
  short_name: 'DSH',
  description: 'DeepSeek Harness web UI with mobile enhancements',
  start_url: '/',
  scope: '/',
  display: 'fullscreen',
  display_override: ['fullscreen', 'standalone'],
  background_color: '#0b0b0f',
  theme_color: '#0b0b0f',
  icons: [
    {
      src: ICON_PATH,
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
    },
  ],
}

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0b0b0f"/>
  <rect x="152" y="88" width="208" height="336" rx="32" fill="none" stroke="#4d6bfe" stroke-width="20"/>
  <path d="M196 196h120M196 250h120M196 304h72" stroke="#4d6bfe" stroke-width="18" stroke-linecap="round"/>
  <circle cx="256" cy="372" r="13" fill="#4d6bfe"/>
</svg>
`

/**
 * A service worker with a fetch handler is what makes the page installable.
 * It deliberately calls `respondWith` nowhere: requests keep going to the
 * network, and the worker exists only to satisfy the installability contract.
 */
const SW_JS = `/* dsh-mobile-enhance: pass-through service worker */
self.addEventListener('install', function () {
  self.skipWaiting()
})
self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim())
})
self.addEventListener('fetch', function () {
  /* Intentionally empty: a fetch handler is required for installability. */
})
`

const MOBILE_CSS = `:root { --dme-kb: 0px; }`

/**
 * Runs in the page before the app boots. Kept dependency-free and wrapped in
 * try/catch so a failure can never block the harness shell.
 */
const BOOT_SCRIPT = `!function () {
  try {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('${SW_PATH}', { scope: '/' }).catch(function () {})
      }, { once: true })
    }

    var vv = window.visualViewport
    if (vv && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      var root = document.documentElement
      var applyKeyboardInset = function () {
        var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
        root.style.setProperty('--dme-kb', kb + 'px')
        root.classList.toggle('dme-kb-open', kb > 80)
      }
      vv.addEventListener('resize', applyKeyboardInset, { passive: true })
      vv.addEventListener('scroll', applyKeyboardInset, { passive: true })
      applyKeyboardInset()
    }

    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      var proto = HTMLInputElement.prototype
      var originalClick = proto.click
      proto.click = function () {
        try {
          if (this.type === 'file' && !this.accept) {
            this.accept = 'image/*'
            this.multiple = true
          }
        } catch (e) {}
        return originalClick.call(this)
      }
    }
  } catch (e) {}
}()
`

/**
 * Send a complete text response.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} type
 * @param {string} body
 * @param {Record<string, string>} [extra]
 */
function send(res, status, type, body, extra = {}) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    ...extra,
  })
  res.end(body)
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(() => {
    const cleanup = []

    cleanup.push(
      ctx.webServer.register({
        kind: 'exact',
        path: SW_PATH,
        handler: (req, res) => {
          if (req.method !== 'GET') {
            send(res, 405, 'text/plain; charset=utf-8', 'method not allowed')
            return
          }
          send(res, 200, 'application/javascript; charset=utf-8', SW_JS, {
            'service-worker-allowed': '/',
          })
        },
      }),
    )

    cleanup.push(
      ctx.webServer.register({
        kind: 'exact',
        path: MANIFEST_PATH,
        handler: (req, res) => {
          if (req.method !== 'GET') {
            send(res, 405, 'text/plain; charset=utf-8', 'method not allowed')
            return
          }
          send(res, 200, 'application/manifest+json; charset=utf-8', JSON.stringify(MANIFEST, null, 2))
        },
      }),
    )

    cleanup.push(
      ctx.webServer.register({
        kind: 'exact',
        path: ICON_PATH,
        handler: (req, res) => {
          if (req.method !== 'GET') {
            send(res, 405, 'text/plain; charset=utf-8', 'method not allowed')
            return
          }
          send(res, 200, 'image/svg+xml; charset=utf-8', ICON_SVG, {
            'cache-control': 'public, max-age=86400',
          })
        },
      }),
    )

    cleanup.push(
      ctx.webServer.tapIndex((html) => {
        let out = html.replace(
          /<meta\s+name="viewport"[^>]*>/i,
          '<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content" />',
        )
        out = out.replace(
          /<link\s+rel="manifest"[^>]*>/i,
          `<link rel="manifest" href="${MANIFEST_PATH}" />`,
        )
        return out
      }),
    )

    return () => {
      for (const dispose of cleanup) {
        try {
          dispose()
        } catch {
          /* Already disposed. */
        }
      }
    }
  }, 'dsh-mobile-enhance: routes and index')

  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: MOBILE_CSS })
    table.push({ kind: 'script', placement: 'head', text: BOOT_SCRIPT })
  })
}
