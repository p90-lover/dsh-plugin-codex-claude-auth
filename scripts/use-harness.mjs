import { readFileSync, writeFileSync } from 'node:fs'
const version = process.argv[2]
const versions = { '0.1.2-rc.1': '0.84.2', '0.1.3-alpha.2': '0.85.1' }
if (!(version in versions)) throw new Error('Unsupported verification target')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
for (const key of Object.keys(pkg.devDependencies)) {
  if (key === '@deepseek-ai/dsh' || key.startsWith('@deepseek-ai/dsh-')) pkg.devDependencies[key] = version
}
pkg.devDependencies['@earendil-works/pi-ai'] = versions[version]
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
