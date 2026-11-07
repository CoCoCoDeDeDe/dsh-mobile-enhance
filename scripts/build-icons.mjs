/**
 * Generate the 192px and 512px PNG icons from assets/icon.svg.
 *
 * Run with `npm run build:icons` (requires the devDependency @resvg/resvg-js).
 * The PNGs are committed so the runtime plugin never depends on resvg.
 */

import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const svg = readFileSync(join(root, 'assets', 'icon.svg'))

for (const size of [192, 512]) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
  })
    .render()
    .asPng()
  const target = join(root, 'assets', `icon-${size}.png`)
  writeFileSync(target, png)
  console.log(`wrote ${target} (${png.length} bytes)`)
}
