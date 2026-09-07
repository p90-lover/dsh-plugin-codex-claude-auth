import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// Only compiler output; never source, credentials, or user workspaces.
rmSync(fileURLToPath(new URL('../lib/', import.meta.url)), { recursive: true, force: true })
