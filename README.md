# dsh-mobile-enhance

Mobile experience layer for the **DeepSeek Harness** Web UI. It adds no screens
of its own — it extends the existing Web GUI so it behaves like a phone app.

Works behind [`dsh-pocket`](https://github.com/shaobeichen/dsh-pocket) or any
reverse proxy: the proxy rewrites `Host`/`Origin`, but `/dme/*`, `/dme-sw.js`
and the served index keep their paths.

## What it does

| Feature | How |
|---|---|
| **Installable PWA** | Serves `/dme/manifest.webmanifest`, `/dme/icon.svg` and a pass-through service worker at `/dme-sw.js`, then rewrites the index `<link rel="manifest">`. Chrome offers *Install app* instead of a plain shortcut, and `display: fullscreen` removes the browser chrome. |
| **Keyboard-safe viewport** | Rewrites the viewport meta with `interactive-widget=resizes-content`, and exposes the on-screen keyboard height as the CSS variable `--dme-kb` (plus `html.dme-kb-open`) on coarse-pointer devices. |
| **Gallery multi-select** | On coarse-pointer devices, patches `HTMLInputElement.prototype.click` so a bare file input gets `accept="image/*"` and `multiple`, opening the system photo picker instead of the document manager. |

## Install

From a local checkout:

```sh
dsh plugin --profile web add link:/path/to/dsh-mobile-enhance -w
```

From GitHub:

```sh
dsh plugin --profile web add github:CoCoCoDeDeDe/dsh-mobile-enhance -w
```

Then restart `dsh web`. The plugin is a Host-only bundle; no client bundle is
loaded.

## Verified against

- `@deepseek-ai/dsh` **0.2.1-rc.5**
- Node **24.x**

## Known limits

- **SVG icon only (MVP).** Chrome's installability check may still require
  192×192 and 512×512 **PNG** icons; if *Install app* does not appear, add PNGs
  under `assets/` and extend the `icons` list in `index.js`.
- **Gallery patch is broad.** Any bare file input on a touch device becomes an
  image picker with multi-select. If you need to send non-image files from the
  phone, that entry point needs a second explicit button.
- **Hover-only actions** (session row menus, message actions) are not handled
  yet; that needs the concrete selectors from a real-device screenshot.

## Development

```sh
# install against the profile, restart dsh web, then open the phone view
dsh plugin --profile web add link:$(pwd) -w
```

The plugin is plain ESM with no build step. `index.js` registers routes and
index transforms through `ctx.webServer`; the injected boot script lives in the
`BOOT_SCRIPT` constant.

## License

MIT
