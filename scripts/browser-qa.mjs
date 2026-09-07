import { chromium } from 'playwright'
import { build } from 'tsdown'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const output = resolve(process.env.QA_OUTPUT ?? 'artifacts/browser')
await mkdir(output, { recursive: true })
const temp = await mkdtemp(join(tmpdir(), 'dsh-oauth-qa-'))
let server, host, browser, native
const findings = { fixture: [], native: [], consoleErrors: [] }
try {
  await build({ config: false, entry: { fixture: 'tests/browser/fixture.tsx' }, outDir: join(temp, 'ui'), platform: 'browser', format: 'iife', dts: false, clean: true, deps: { alwaysBundle: [/.*/], onlyBundle: false }, define: { 'process.env.NODE_ENV': JSON.stringify('production') } })
  server = createServer(async (req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); res.end(await readFile(join(temp, 'ui', 'fixture.iife.js')).catch(() => readFile(join(temp, 'ui', 'fixture.js')))); return }
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>Provider Control Center test fixture</title><style>body{margin:0;background:#f6f8fb;font-family:system-ui,"Noto Sans CJK TC",sans-serif}main{box-sizing:border-box;max-width:1100px;margin:36px auto;padding:28px;background:#fff;border:1px solid #e2e7ef;border-radius:14px}@media(max-width:600px){main{margin:0;padding:16px;border:0;border-radius:0}}</style><main id="root"></main><script src="/fixture.js"></script></html>')
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
  page.setDefaultTimeout(20000)
  page.on('pageerror', error => findings.consoleErrors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.getByText('Example workspace · test data').first().waitFor()
  assert.equal(await page.locator('.o-meter span').count(), 3)
  await page.screenshot({ path: join(output, 'accounts-desktop.png'), fullPage: true })
  findings.fixture.push('Account cards, quota and complete control center render.')
  await page.getByRole('tab', { name: '上下文', exact: true }).click()
  await page.getByRole('button', { name: '500K', exact: true }).click()
  await page.getByRole('button', { name: '套用上下文', exact: true }).click()
  await page.getByText('設定已由宿主確認。下一個請求會使用新的有效上限。').waitFor()
  assert.equal(await page.evaluate(() => window.fixture.mutations.some(m => m.action === '/context-window' && m.body.value === 500000)), true)
  await page.screenshot({ path: join(output, 'context-desktop.png'), fullPage: true })
  await page.getByRole('tab', { name: '代理路由', exact: true }).click()
  await page.getByLabel('顯示名稱', { exact: true }).fill('Test proxy')
  await page.getByLabel('HTTP(S) 代理 URL', { exact: true }).fill('http://test:fake@proxy.invalid:8080')
  await page.getByRole('button', { name: '新增代理', exact: true }).click()
  await page.getByText('http://proxy.invalid:8080', { exact: true }).first().waitFor()
  assert.equal((await page.locator('body').innerText()).includes('test:fake'), false)
  await page.screenshot({ path: join(output, 'proxy-desktop.png'), fullPage: true })
  await page.getByRole('tab', { name: '自動備援', exact: true }).click()
  const allow = page.getByRole('checkbox', { name: '允許此目的地', exact: true }).first()
  assert.equal(await allow.isChecked(), false)
  await allow.click()
  await page.getByText('備援設定已儲存。').waitFor()
  assert.equal(await allow.isChecked(), true)
  await page.getByRole('combobox', { name: '推理強度', exact: true }).first().selectOption('high')
  await page.waitForFunction(() => document.querySelectorAll('.o-fields select')[1]?.value === 'high')
  await page.screenshot({ path: join(output, 'fallback-desktop.png'), fullPage: true })
  assert.equal(await page.evaluate(() => window.fixture.mutations.some(m => m.action === '/failover/effort' && m.body.effortId === 'high')), true)
  findings.fixture.push('Context save, proxy add/redaction, explicit fallback enable and effort write acknowledged.')
  await page.evaluate(() => window.fixture.selectClaude())
  await page.locator('[data-active-provider="claude"]').waitFor()
  assert.equal(await page.getByRole('button', { name: '管理 OpenAI 上下文', exact: true }).count(), 0)
  findings.fixture.push('Claude switch removes OpenAI context controls.')
  await page.getByRole('tab', { name: '工作交接', exact: true }).click()
  await page.getByLabel('任務目標', { exact: true }).fill('Continue verified UI work')
  await page.getByRole('checkbox').check()
  const downloadWait = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出可讀摘要', exact: true }).click()
  const download = await downloadWait
  assert.equal(download.suggestedFilename(), 'task-handoff.md')
  findings.fixture.push('Reviewed task handoff creates a Markdown download, not a fake execution.')
  await page.getByRole('tab', { name: '診斷', exact: true }).click()
  await page.screenshot({ path: join(output, 'diagnostics-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 420, height: 900 })
  await page.getByRole('tab', { name: '帳號與額度', exact: true }).click()
  assert.equal(await page.locator('.dsh-oauth').first().evaluate(el => el.scrollWidth <= el.clientWidth + 2), true)
  await page.screenshot({ path: join(output, 'accounts-mobile.png'), fullPage: true })
  findings.fixture.push('420px viewport retains usable cards and no control-center horizontal overflow.')

  const home = join(temp, 'home')
  const profileModules = join(home, 'profiles', 'web', 'node_modules')
  await mkdir(profileModules, { recursive: true })
  await symlink(resolve('.'), join(profileModules, 'dsh-oauth-model-providers'), process.platform === 'win32' ? 'junction' : 'dir')
  const cli = require.resolve('@deepseek-ai/dsh/package.json')
  const cliBin = join(cli.substring(0, cli.lastIndexOf('/')), 'lib', 'bin.js')
  const command = process.env.DSH_CLI_BIN ?? cliBin
  let bootLog = ''
  host = spawn(process.execPath, [command, '--profile', 'web', '--patch', resolve('cordis.patch.yml'), '--no-open', '--port', '3097'], { env: { ...process.env, DSH_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] })
  host.stdout.on('data', b => { bootLog += String(b) }); host.stderr.on('data', b => { bootLog += String(b) })
  const until = Date.now() + 90000
  let url
  while (Date.now() < until) {
    url = bootLog.match(/http:\/\/127\.0\.0\.1:3097\/\?token=[^\s]+/)?.[0]
    if (url) break
    if (host.exitCode !== null) throw new Error('Isolated Harness boot failed: ' + bootLog.replace(/([?&](?:token|code|state)=)[^\s&]+/gu, '$1[redacted]').slice(-5000))
    await new Promise(r => setTimeout(r, 300))
  }
  if (!url) throw new Error('Isolated Harness boot timed out.')
  const unauth = await fetch('http://127.0.0.1:3097/plugins/dsh-oauth-model-providers/oauth/openai-codex-oauth/status', { signal: AbortSignal.timeout(15000) })
  assert.equal(unauth.status, 401)
  findings.native.push('Unauthenticated plugin status returns 401 on the actual native web server.')
  native = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
  native.setDefaultTimeout(20000)
  native.on('pageerror', e => findings.consoleErrors.push(e.message))
  await native.goto(url)
  await native.getByRole('button', { name: /^(Continue|继续|繼續)$/ }).click()
  await native.getByRole('button', { name: /^(Configure later|稍后配置|稍後設定)$/ }).click()
  await native.getByRole('button', { name: /^(Settings|设置|設定)$/ }).first().click()
  await native.getByText('模型與帳號 / OAuth', { exact: true }).click()
  await native.getByRole('heading', { name: '模型與帳號', exact: true }).waitFor()
  await native.screenshot({ path: join(output, 'native-harness-control-center.png'), fullPage: true })
  findings.native.push('Real Harness settings renders the plugin through its package bundle and native slot loader.')
  await native.getByRole('tab', { name: '上下文', exact: true }).click()
  await native.getByText('請先在「帳號與額度」登入 OpenAI，再調整上下文預算。').waitFor()
  assert.equal(await native.getByRole('button', { name: '套用上下文', exact: true }).count(), 0)
  const refused = await native.evaluate(async () => {
    const response = await fetch('/plugins/dsh-oauth-model-providers/oauth/openai-codex-oauth/context-window', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 500000 }),
    })
    const saved = await (await fetch('/plugins/dsh-oauth-model-providers/oauth/openai-codex-oauth/status')).json()
    return { status: response.status, selected: saved.contextWindow.selected }
  })
  assert.equal(refused.status, 400)
  assert.equal(refused.selected, 252000)
  findings.native.push('Unsigned-in context controls explain the requirement; a direct write is refused and leaves the saved budget unchanged.')
  await native.screenshot({ path: join(output, 'native-harness-context.png'), fullPage: true })
  // Proxy preferences can be edited before login: verify a real write and readback.
  await native.getByRole('tab', { name: '代理路由', exact: true }).click()
  await native.getByLabel('顯示名稱', { exact: true }).fill('Isolated QA proxy')
  await native.getByLabel('HTTP(S) 代理 URL', { exact: true }).fill('http://test:fake@proxy.invalid:8080')
  await native.getByRole('button', { name: '新增代理', exact: true }).click()
  await native.getByText('代理已安全儲存。', { exact: true }).waitFor()
  const savedProxy = await native.evaluate(async () => (await fetch('/plugins/dsh-oauth-model-providers/oauth/openai-codex-oauth/status')).json())
  assert.equal(savedProxy.proxy.entries.length, 1)
  assert.equal(savedProxy.proxy.entries[0].display, 'http://proxy.invalid:8080')
  assert.equal(JSON.stringify(savedProxy).includes('test:fake'), false)
  await native.screenshot({ path: join(output, 'native-harness-proxies.png'), fullPage: true })
  await native.getByRole('button', { name: '移除', exact: true }).click()
  await native.getByRole('button', { name: '確認移除', exact: true }).click()
  await native.getByText('代理已移除。', { exact: true }).waitFor()
  const removedProxy = await native.evaluate(async () => (await fetch('/plugins/dsh-oauth-model-providers/oauth/openai-codex-oauth/status')).json())
  assert.equal(removedProxy.proxy.entries.length, 0)
  findings.native.push('Real authenticated proxy add, redacted readback, confirmation and removal succeed through the native Settings UI.')
  assert.deepEqual(findings.consoleErrors, [])
} catch (error) {
  if (native && !native.isClosed()) await native.screenshot({ path: join(output, 'native-failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally {
  await writeFile(join(output, 'results.json'), JSON.stringify(findings, null, 2))
  await browser?.close()
  if (host && host.exitCode === null) {
    const exited = once(host, 'exit')
    host.kill('SIGTERM')
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))])
    if (host.exitCode === null) host.kill('SIGKILL')
  }
  server?.close()
  await rm(temp, { recursive: true, force: true })
}
console.log(JSON.stringify(findings, null, 2))
