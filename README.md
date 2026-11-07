# dsh-mobile-enhance

Mobile experience layer for the **DeepSeek Harness** Web UI. It adds no screens
of its own — it extends the existing Web GUI so it behaves like a phone app.

Works behind [`dsh-pocket`](https://github.com/shaobeichen/dsh-pocket) or any
reverse proxy: the proxy rewrites `Host`/`Origin`, but `/dme/*`, `/dme-sw.js`
and the served index keep their paths.

## What it does

| Feature | How |
|---|---|
| **Installable PWA** | Serves `/dme/manifest.webmanifest`, SVG + 192/512 PNG icons and a pass-through service worker at `/dme-sw.js`, then rewrites the index `<link rel="manifest">`. Chrome offers *Install app* instead of a plain shortcut, and `display: fullscreen` removes the browser chrome. |
| **Keyboard-safe viewport** | Rewrites the viewport meta with `interactive-widget=resizes-content`, and exposes the on-screen keyboard height as the CSS variable `--dme-kb` (plus `html.dme-kb-open`) on coarse-pointer devices. |
| **Gallery button** | On coarse-pointer devices, injects a gallery button beside the composer "+" button. One tap opens the system photo picker with `accept="image/*"` and multi-select; the normal "+ → File" path keeps the document picker, so files still work. |
| **Touch hover actions** | Keeps opacity-hidden session actions visible under `@media (hover: none)`. |

## Install

From a local checkout:

```sh
dsh plugin --profile web add link:/path/to/dsh-mobile-enhance -w
```

From GitHub:

```sh
dsh plugin --profile web add github:CoCoCoDeDeDe/dsh-mobile-enhance -w
```

Then restart `dsh web` (or touch the profile patch to trigger HMR). The plugin
is a Host-only bundle; no client bundle is loaded.

## Updating a page you already opened

The injected index is served with `Cache-Control: no-store`, but a phone tab may
still hold the previous document. To force a fresh load on Android Chrome:

1. Pull down to refresh, or tap **⋮ → Reload**; or
2. **⋮ → Settings → Privacy and security → Clear browsing data → Cached images
   and files** (keep cookies so you stay signed in); or
3. Open the same URL in a new tab and close the old one.

After a service worker is registered, a normal reload is enough because the
worker is pass-through and never caches the shell.

## Verified against

- `@deepseek-ai/dsh` **0.2.1-rc.5**
- Node **24.x**

## Known limits

- **Install prompt still depends on Chrome.** The manifest now carries 192 and
  512 PNGs plus a service worker, which is the documented installability set.
  If *Install app* still does not appear, check `chrome://webapks` or remote
  DevTools → Application → Manifest for the exact rejection reason.
- **Gallery button placement is heuristic.** It anchors on the hidden
  `<input type="file">` in the composer toolbar. If a future harness release
  moves that input, the button stops appearing (no other behaviour breaks).
- **Hover-reveal coverage is generic.** `[class*="_actions"]` covers the current
  class suffix; a renamed suffix needs a new selector.
- **Sidebar popovers on narrow screens** (a workspace menu clipped by the open
  drawer) are not fixed yet; that needs the concrete DOM from a device.

## dsh-pocket compatibility

When the Web UI is reached through `dsh-pocket`, its access-PIN gate answers
Chrome's internal **manifest and icon requests with 401** — those requests do
not carry the PIN cookie. Chrome then parses an empty manifest and never offers
*Install app*. The page itself and the DSH API are unaffected.

`dsh-mobile-enhance` ships an idempotent patch for that gate:

```sh
npm run patch:dsh-pocket
```

It exempts `/dme/*` and `/dme-sw.js` from the PIN check and leaves every other
path authenticated. `dsh-pocket` is replaced on upgrade, so re-run this after:

```sh
dsh plugin --profile web update dsh-pocket --latest -w
```

The script prints `already patched` when nothing is needed, and writes a
`proxy.mjs.dme-bak` backup before changing anything.

## Development

```sh
npm run build:icons   # regenerate assets/icon-{192,512}.png from assets/icon.svg
npm run patch:dsh-pocket   # re-apply the PWA asset exemption after dsh-pocket updates
dsh plugin --profile web add link:$(pwd) -w
```

The plugin is plain ESM with no build step. `index.js` registers routes and
index transforms through `ctx.webServer`; the injected boot script lives in the
`BOOT_SCRIPT` constant.

## License

MIT
