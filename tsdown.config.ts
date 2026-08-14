import { defineConfig } from 'tsdown'

const clientExternals = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
] as const

export default defineConfig([
  {
    name: 'dsh-oauth-model-providers',
    entry: {
      index: 'src/index.ts',
      openai: 'src/openai.ts',
      anthropic: 'src/anthropic.ts',
    },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    clean: false,
    external: [/^@deepseek-ai\//u, /^@earendil-works\//u],
  },
  {
    name: 'dsh-oauth-model-providers/client',
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...clientExternals],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-oauth-model-providers", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
