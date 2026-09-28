import { readFileSync, writeFileSync } from 'node:fs'
const version = process.argv[2]
const versions = { '0.1.2-rc.1': '0.84.2', '0.1.3-alpha.2': '0.85.1', '0.1.7-rc.2': '0.85.1' }
if (!(version in versions)) throw new Error('Unsupported verification target')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
for (const key of Object.keys(pkg.devDependencies)) {
  if (key === '@deepseek-ai/dsh' || key.startsWith('@deepseek-ai/dsh-')) pkg.devDependencies[key] = version
}
pkg.devDependencies['@earendil-works/pi-ai'] = versions[version]
if (version !== '0.1.7-rc.2') {
  // These hosts predate the Config/HMR migration. Verify their original
  // framework generation rather than pulling incompatible newer helpers.
  pkg.devDependencies['@deepseek-ai/cordis'] = '4.0.2'
  pkg.devDependencies['@deepseek-ai/schemastery'] = '3.18.2'
  pkg.pnpm = { ...pkg.pnpm, overrides: {
    ...pkg.pnpm?.overrides,
    '@deepseek-ai/cordis': '4.0.2',
    '@deepseek-ai/cordis-plugin-group': '1.0.2',
    '@deepseek-ai/cordis-plugin-hmr': '1.0.17',
    '@deepseek-ai/cordis-plugin-include': '1.0.7',
    '@deepseek-ai/cordis-plugin-loader': '1.0.3',
    '@deepseek-ai/cordis-plugin-timer': '1.1.4',
    '@deepseek-ai/cosmokit': '1.8.3',
    '@deepseek-ai/schemastery': '3.18.2',
  } }
}
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
