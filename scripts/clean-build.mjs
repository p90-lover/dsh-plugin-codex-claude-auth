import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// Keep previous compiler output recoverable while building a fresh package.
const output = fileURLToPath(new URL('../lib/', import.meta.url))
if (existsSync(output)) {
  const backup = fileURLToPath(new URL(`../Trash/build-${Date.now()}/`, import.meta.url))
  mkdirSync(backup, { recursive: true })
  renameSync(output, `${backup}/lib`)
}
