/**
 * dsh-mobile-enhance — Host half.
 *
 * A mobile-experience layer for the DeepSeek Harness Web UI. It contributes no
 * new UI of its own; it extends the served index and the browser runtime so the
 * existing Web GUI behaves better on a phone:
 *
 * - PWA: serves a pass-through service worker plus a manifest with 192/512 PNG
 *   icons, so Chrome can offer "Install app" instead of only a shortcut.
 * - Keyboard: rewrites the viewport meta with `interactive-widget=resizes-content`,
 *   keeps the shell above the keyboard, and exposes the inset as `--dme-kb`.
 * - Gallery: on coarse-pointer devices, injects a gallery button beside the
 *   composer "+" button. It temporarily sets accept=image/* for its own pick and
 *   restores the attribute right after, so the document picker keeps every file
 *   type.
 *
 * Everything is served through the harness webServer, so it also works behind
 * dsh-pocket (the proxy rewrites Host/Origin but forwards these paths unchanged).
 */

import { readFileSync } from 'node:fs'

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
  id: '/',
  name: 'DeepSeek Harness',
  short_name: 'DSH',
  description: 'DeepSeek Harness web UI with mobile enhancements',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#0b0b0f',
  theme_color: '#0b0b0f',
  icons: [
    {
      src: `${PREFIX}/icon-192.png`,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: `${PREFIX}/icon-512.png`,
      sizes: '512x512',
      type: 'image/png',
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

const MOBILE_CSS = `:root { --dme-kb: 0px; }

/* Touch devices have no hover, so hover-revealed session actions would never
   appear. Keep them visible wherever the harness used opacity to hide them. */
@media (hover: none) and (pointer: coarse) {
  [class*="_actions"] { opacity: 1 !important; }
  /* The workspace row's .../+ actions are display:none until hover; keep them
     visible on touch. Session rows stay hover-revealed so the list is not
     crowded. */
  [class*="_projectRow"] [class*="_rowActions"] { display: flex !important; }
}

/* A workspace menu anchored near the drawer's right edge can render under the
   open drawer on a narrow screen. Keep the harness menu surfaces above it. */
@media (max-width: 1100px) {
  [role="menu"], [data-menu-group], [data-menu-material], [data-dockkit-tab-menu] {
    z-index: 2147483000 !important;
  }
}
`

/**
 * Small self-diagnostic page for the PWA install path. It reports the manifest
 * link the page actually sees, the service-worker state, and whether every
 * install asset is reachable from the browser.
 */
const STATUS_HTML = `<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DSH Mobile Enhance · 状态</title>
<style>body{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;padding:16px;background:#0b0b0f;color:#e6e6e6;white-space:pre-wrap;word-break:break-all}pre{margin:0}</style>
</head>
<body><pre id="out">检查中…</pre>
<script>
(async function(){
  var out = []; var el = document.getElementById('out');
  function line(s){ out.push(s); el.textContent = out.join('\\n') }
  try {
    line('URL: ' + location.href);
    line('secureContext: ' + window.isSecureContext);
    var link = document.querySelector('link[rel=manifest]');
    line('manifest link: ' + (link ? link.href : '(none)'));
    try {
      var indexHtml = await fetch('/', { cache: 'no-store' }).then(function (r) { return r.text() });
      var tag = indexHtml.match(/<link[^>]+rel="manifest"[^>]*>/i);
      line('index manifest tag: ' + (tag ? tag[0] : '(none)'));
    } catch (e) { line('index fetch: ' + e.message); }
    line('SW supported: ' + ('serviceWorker' in navigator));
    if ('serviceWorker' in navigator) {
      var reg = await navigator.serviceWorker.getRegistration();
      line('SW registration: ' + (reg ? (reg.active ? 'active' : (reg.installing ? 'installing' : 'waiting')) : 'none'));
      line('SW controller: ' + (navigator.serviceWorker.controller ? 'yes' : 'no'));
    }
    try { line('installable (beforeinstallprompt seen): ' + (localStorage.getItem('dme-installable') || 'no')); } catch (e) {}
    for (var u of ['/dme/manifest.webmanifest', '/dme/icon-192.png', '/dme/icon-512.png', '/dme-sw.js']) {
      try {
        var r = await fetch(u, { cache: 'no-store' });
        line(u + ' -> ' + r.status + ' ' + (r.headers.get('content-type') || ''));
      } catch (e) { line(u + ' -> FETCH FAIL ' + e.message); }
    }
    var m = await fetch('/dme/manifest.webmanifest', { cache: 'no-store' })
      .then(function(r){ return r.json() }).catch(function(){ return null });
    if (m) { line('display: ' + m.display); line('icons: ' + JSON.stringify(m.icons)); }
  } catch (e) { line('ERROR: ' + e.message); }
})();
</script></body></html>
`

/**
 * PNG icons are committed build artifacts (`npm run build:icons`). A missing
 * file skips its route instead of failing plugin activation.
 */
function readIconPng(size) {
  try {
    return readFileSync(new URL(`./assets/icon-${size}.png`, import.meta.url))
  } catch {
    return null
  }
}

const ICON_PNG = {
  192: readIconPng(192),
  512: readIconPng(512),
}

/**
 * Runs in the page before the app boots. Kept dependency-free and wrapped in
 * try/catch so a failure can never block the harness shell.
 */
const BOOT_SCRIPT = `!function () {
  try {
    /* dsh-pocket's mobile layer rewrites the viewport meta to
       "viewport-fit=cover" and drops interactive-widget, which re-enables
       keyboard overlap. Merge our flag back whenever the meta changes. */
    var ensureViewport = function () {
      var meta = document.querySelector('meta[name=viewport]')
      if (!meta) return
      var content = meta.getAttribute('content') || ''
      if (content.indexOf('interactive-widget') >= 0) return
      meta.setAttribute('content', content + ', interactive-widget=resizes-content')
    }
    ensureViewport()
    new MutationObserver(ensureViewport).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['content'],
      childList: true,
      subtree: true,
    })
    document.addEventListener('DOMContentLoaded', ensureViewport, { once: true })
    window.addEventListener('load', ensureViewport, { once: true })
    setInterval(ensureViewport, 1000)

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('${SW_PATH}', { scope: '/' }).catch(function () {})
      }, { once: true })
    }

    /* Record whether Chrome actually considers this page installable, so the
       status page can report it without DevTools. */
    window.addEventListener('beforeinstallprompt', function () {
      try { localStorage.setItem('dme-installable', '1') } catch (e) {}
    })

    var vv = window.visualViewport
    if (vv && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      var root = document.documentElement
      var applyKeyboardInset = function () {
        var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
        root.style.setProperty('--dme-kb', kb + 'px')
        root.classList.toggle('dme-kb-open', kb > 80)
        /* Some harness builds keep the shell at a fixed viewport height even
           with interactive-widget=resizes-content, so the composer can stay
           under the keyboard until a re-render. Shrink the shell itself while
           the keyboard is open, and clear the override when it closes. */
        var app = document.getElementById('root')
        if (app) app.style.height = kb > 80 ? vv.height + 'px' : ''
      }
      vv.addEventListener('resize', applyKeyboardInset, { passive: true })
      vv.addEventListener('scroll', applyKeyboardInset, { passive: true })
      applyKeyboardInset()
    }

    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return

    /* The composer toolbar's mousedown handler re-focuses the editor, which
       pops the keyboard whenever the toolbar is expanded on a phone. Stop that
       press before React sees it; the button's own click still fires. */
    document.addEventListener('mousedown', function (event) {
      try {
        var target = event.target
        if (!(target instanceof Element)) return
        if (!target.closest('button')) return
        if (!target.closest('[class*="_tools"], [class*="_trailing"]')) return
        event.stopPropagation()
      } catch (e) {}
    }, true)

    /* Page load: the harness auto-focuses the editor, which pops the keyboard
       before the user asks for it. Blur only *programmatic* focus in the first
       two seconds; a real tap (isTrusted) is never blocked. */
    var initialFocusGuard = true
    setTimeout(function () { initialFocusGuard = false }, 2000)
    document.addEventListener('focusin', function (event) {
      if (!initialFocusGuard || event.isTrusted) return
      var target = event.target
      if (target && target.isContentEditable) {
        try { target.blur() } catch (e) {}
      }
    }, true)

    /* Keep the "+" command menu, but stop its click handler from focusing the
       editor — that focus is what pops the keyboard on a phone. If the keyboard
       is already open, drop it shortly after the menu opens as well. */
    var blockEditorFocus = false
    var protoFocus = HTMLElement.prototype.focus
    HTMLElement.prototype.focus = function () {
      if (blockEditorFocus && this.isContentEditable) return
      return protoFocus.apply(this, arguments)
    }
    document.addEventListener('click', function (event) {
      try {
        var target = event.target
        if (!(target instanceof Element)) return
        var button = target.closest('button[class*="_add"]')
        if (!button || !button.closest('[class*="_tools"]')) return
        blockEditorFocus = true
        setTimeout(function () {
          blockEditorFocus = false
          var active = document.activeElement
          if (active && active.isContentEditable && document.documentElement.classList.contains('dme-kb-open')) {
            try { active.blur() } catch (e) {}
          }
        }, 120)
      } catch (e) {}
    }, true)

    /* The harness composer keeps one persistent <input type=file>. On Android
     * the native picker opens the photo picker even with accept="*/*", so the
     * document pick goes through the File System Access API instead; the gallery
     * button opts back into the native picker. */
    var allowNativePicker = false
    if (typeof window.showOpenFilePicker === 'function') {
      var protoClick = HTMLInputElement.prototype.click
      HTMLInputElement.prototype.click = function () {
        if (this.type === 'file' && !allowNativePicker) {
          var input = this
          try {
            window.showOpenFilePicker({ multiple: true })
              .then(function (handles) {
                return Promise.all(handles.map(function (handle) { return handle.getFile() }))
              })
              .then(function (files) {
                var transfer = new DataTransfer()
                for (var i = 0; i < files.length; i++) transfer.items.add(files[i])
                input.files = transfer.files
                input.dispatchEvent(new Event('change', { bubbles: true }))
              })
              .catch(function () {})
          } catch (e) {
            return protoClick.call(this)
          }
          return
        }
        return protoClick.call(this)
      }
    }

    /* A gallery button beside the composer "+" button. The toolbar already
     * holds the hidden file input, so it gives us both the anchor and the
     * target for the pick. */
    var GALLERY_ATTR = 'data-dme-gallery'
    var mountGallery = function (input) {
      var parent = input && input.parentElement
      if (!parent || parent.querySelector('[' + GALLERY_ATTR + ']')) return
      /* An empty accept makes some Android builds fall back to the photo
         picker; keep an explicit "all files" value on the shared input. */
      if (!input.hasAttribute('accept')) input.setAttribute('accept', '*/*')
      var button = document.createElement('button')
      button.type = 'button'
      button.setAttribute(GALLERY_ATTR, '')
      button.setAttribute('aria-label', '从相册选择')
      button.title = '从相册选择'
      button.style.cssText =
        'width:28px;height:28px;border:none;border-radius:999px;background:var(--dsw-specific-selector,#f3f4f6);color:var(--dsw-alias-label-primary,#111);display:grid;place-items:center;cursor:pointer;flex:none;padding:0'
      button.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
      button.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        var current = parent.querySelector('input[type=file]')
        if (!current) return
        var previousAccept = current.getAttribute('accept')
        var previousMultiple = current.multiple
        allowNativePicker = true
        current.accept = 'image/*'
        current.multiple = true
        current.click()
        setTimeout(function () {
          try {
            allowNativePicker = false
            current.setAttribute('accept', previousAccept === null ? '*/*' : previousAccept)
            current.multiple = previousMultiple
          } catch (e) {}
        }, 0)
      })
      parent.insertBefore(button, input)
    }

    /* Clear any stale image accept when the command menu's File item is used. */
    document.addEventListener('click', function (event) {
      try {
        var target = event.target
        if (!(target instanceof Element)) return
        var item = target.closest('[role="menuitem"]')
        if (!item) return
        var label = (item.textContent || '').trim()
        if (label.indexOf('文件') < 0 && !/file/i.test(label)) return
        var inputs = document.querySelectorAll('input[type=file]')
        for (var i = 0; i < inputs.length; i++) inputs[i].setAttribute('accept', '*/*')
      } catch (e) {}
    }, true)

    var scanTimer = 0
    var scan = function () {
      scanTimer = 0
      var inputs = document.querySelectorAll('input[type=file]')
      for (var i = 0; i < inputs.length; i++) mountGallery(inputs[i])
    }
    var scheduleScan = function () {
      if (scanTimer) return
      scanTimer = setTimeout(scan, 50)
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scheduleScan, { once: true })
    } else {
      scheduleScan()
    }
    new MutationObserver(scheduleScan).observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
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

    for (const [size, bytes] of Object.entries(ICON_PNG)) {
      if (!bytes) continue
      cleanup.push(
        ctx.webServer.register({
          kind: 'exact',
          path: `${PREFIX}/icon-${size}.png`,
          handler: (req, res) => {
            if (req.method !== 'GET') {
              send(res, 405, 'text/plain; charset=utf-8', 'method not allowed')
              return
            }
            res.writeHead(200, {
              'content-type': 'image/png',
              'cache-control': 'public, max-age=86400',
              'x-content-type-options': 'nosniff',
            })
            res.end(bytes)
          },
        }),
      )
    }

    cleanup.push(
      ctx.webServer.register({
        kind: 'exact',
        path: `${PREFIX}/status`,
        handler: (req, res) => {
          if (req.method !== 'GET') {
            send(res, 405, 'text/plain; charset=utf-8', 'method not allowed')
            return
          }
          send(res, 200, 'text/html; charset=utf-8', STATUS_HTML)
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
