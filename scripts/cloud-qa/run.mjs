import { chromium } from 'playwright'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import assert from 'node:assert/strict'
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Cloud-only QA: refusing to launch DSH locally.')
const exec = promisify(execFile)
const require = createRequire(import.meta.url)
const output = resolve('aiTemp/cloud-qa-results')
await mkdir(output, { recursive: true })
const temp = await mkdtemp(resolve('aiTemp/cloud-qa-home-'))
const cli = join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js')
const home = join(temp, 'home')
const env = { ...process.env, DSH_HOME: home }
const report = { release: 'v0.9.0', dsh: require('@deepseek-ai/dsh/package.json').version, execution: 'GitHub-hosted Ubuntu; no user credentials', upstream: 'simulated OAuth, catalogs, quota and inference', checks: [], layouts: [], pageErrors: [], consoleErrors: [], screenshots: [] }
const tabs = [
  ['Accounts & quota', '帳號與額度'], ['Context', '上下文'], ['Proxy routing', '代理路由'],
  ['Fallback', '自動備援'], ['Diagnostics', '診斷'], ['Task handoff', '工作交接'],
]
let host, browser, page, root, boot = '', shot = 0
const clean = value => String(value).replace(/([?&](?:token|code|state)=)[^\s&]+/gu, '$1[redacted]')
async function poll(read, valid, timeout = 25000) {
  const until = Date.now() + timeout
  let value
  while (Date.now() < until) {
    value = await read()
    if (valid(value)) return value
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error('Condition timed out: ' + JSON.stringify(value))
}
async function api(provider, action = '/status', body) {
  return page.evaluate(async ({ provider, action, body }) => {
    const response = await fetch('/plugins/dsh-oauth-model-providers/oauth/' + provider + action, body === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }, { provider, action, body })
}
const codex = () => api('openai-codex-oauth')
const claude = () => api('anthropic-oauth')
async function openSettings() {
  if (!(await page.getByRole('heading', { name: /^(模型與帳號|Provider Control Center)$/ }).isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /^(Settings|设置|設定)$/ }).first().click()
    await page.getByText('模型與帳號 / OAuth', { exact: true }).click()
  }
  root = page.locator('.dsh-oauth').filter({ has: page.getByRole('tablist') }).first()
  await root.waitFor()
  await root.getByRole('button', { name: 'English', exact: true }).click()
}
async function capture(label) {
  const file = String(++shot).padStart(2, '0') + '-' + label + '.png'
  await page.screenshot({ path: join(output, file), fullPage: true })
  report.screenshots.push({ file, label, viewport: page.viewportSize() })
  return file
}
async function check(name, fn) {
  try { await fn(); report.checks.push({ name, status: 'pass' }); console.log('PASS ' + name); return true }
  catch (error) {
    report.checks.push({ name, status: 'fail', error: clean(error.stack ?? error) })
    console.log('FAIL ' + name + ': ' + clean(error.message ?? error))
    if (page) {
      await capture('failure-' + report.checks.length).catch(() => {})
      await writeFile(join(output, 'failure-' + report.checks.length + '.txt'), clean(await page.locator('body').innerText().catch(() => '')))
    }
    return false
  }
}
async function tab(index, language = 0) {
  await root.getByRole('tab', { name: tabs[index][language], exact: true }).click()
}
async function login(provider, count) {
  await tab(0)
  const panel = root.locator('[data-provider-panel="' + provider + '"]')
  await panel.getByRole('button', { name: count === 1 ? 'Connect account' : 'Add account', exact: true }).click()
  if (provider === 'codex') await panel.getByRole('button', { name: 'Browser login (default)', exact: true }).click()
  const link = panel.getByRole('link', { name: 'Open provider sign-in', exact: true })
  await link.waitFor()
  const state = new URL(await link.getAttribute('href')).searchParams.get('state')
  assert.ok(state)
  if (provider === 'codex' && count === 1) {
    await panel.getByRole('textbox', { name: 'Complete login in your browser, or paste the authorization code / redirect URL here:', exact: true }).fill('cloud-qa-code#' + state)
    await panel.getByRole('button', { name: 'Submit and continue', exact: true }).click()
  } else {
    const callback = new URL(new URL(await link.getAttribute('href')).searchParams.get('redirect_uri'))
    assert.ok(['localhost', '127.0.0.1'].includes(callback.hostname))
    callback.hostname = '127.0.0.1'
    callback.searchParams.set('code', 'cloud-qa-code')
    callback.searchParams.set('state', state)
    assert.equal((await fetch(callback)).status, 200)
  }
  await panel.getByText('Sign-in credentials saved.', { exact: true }).waitFor()
  await panel.getByRole('button', { name: 'Done', exact: true }).click()
  const status = await poll(provider === 'codex' ? codex : claude, value => value.body.connected && value.body.accounts.length === count)
  assert.equal(status.status, 200)
}
async function download(button, file) {
  const pending = page.waitForEvent('download')
  await button.click()
  const item = await pending
  await item.saveAs(join(output, file))
  return readFile(join(output, file), 'utf8')
}
async function layoutSweep() {
  for (const viewport of [{ width: 1440, height: 1080 }, { width: 1024, height: 768 }, { width: 420, height: 900 }]) {
    await page.setViewportSize(viewport)
    for (const language of [0, 1]) {
      await root.getByRole('button', { name: language === 0 ? 'English' : '中文', exact: true }).click()
      for (let index = 0; index < tabs.length; index++) {
        await tab(index, language)
        await root.getByRole('tablist').scrollIntoViewIfNeeded()
        await page.evaluate(() => document.fonts.ready)
        const geometry = await root.evaluate(el => {
          const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.closest('[hidden]')
          const box = el.getBoundingClientRect()
          const controls = [...el.querySelectorAll('button,input,select,textarea,a')].filter(visible).map(node => {
            const rect = node.getBoundingClientRect()
            return { tag: node.tagName, text: (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 90), x: rect.x, y: rect.y, width: rect.width, height: rect.height,
              outside: rect.left < Math.max(0, box.left) - 2 || rect.right > Math.min(innerWidth, box.right) + 2 }
          })
          return { root: { x: box.x, width: box.width, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }, viewport: innerWidth, horizontalOverflow: el.scrollWidth > el.clientWidth + 2, controlsOutside: controls.filter(c => c.outside), controls }
        })
        const label = 'native-' + viewport.width + '-' + (language ? 'zh' : 'en') + '-tab-' + index
        const screenshot = await capture(label)
        report.layouts.push({ label, tab: tabs[index][language], screenshot, ...geometry })
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1080 })
  await root.getByRole('button', { name: 'English', exact: true }).click()
}
try {
  const archive = resolve(process.env.QA_PLUGIN_PACKAGE)
  await exec(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', archive, '--ignore-scripts', '--store-dir', join(temp, 'store')], { env, timeout: 120000 })
  report.checks.push({ name: 'Published archive installed through dsh plugin add in a fresh cloud profile', status: 'pass' })
  const patch = join(temp, 'transport.yml')
  await writeFile(patch, '- id: llm-openai-codex-oauth\n  config:\n    transport: sse\n- id: llm-anthropic-oauth\n  config:\n    transport: sse\n')
  host = spawn(process.execPath, ['--import', resolve('scripts/cloud-qa/provider-fixture.mjs'), cli, '--profile', 'web', '--patch', patch, '--no-open', '--port', '3097'], {
    env: { ...env, QA_WIRE_LOG: join(output, 'provider-wire.jsonl') }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  host.stdout.on('data', data => { boot += data }); host.stderr.on('data', data => { boot += data })
  const url = await poll(async () => {
    if (host.exitCode !== null) throw new Error('DSH exited: ' + clean(boot).slice(-8000))
    const address = boot.match(/http:\/\/127\.0\.0\.1:3097\/\?token=[^\s]+/)?.[0]
    if (!address) return null
    try { const response = await fetch('http://127.0.0.1:3097/', { signal: AbortSignal.timeout(1000) }); return response.status ? address : null } catch { return null }
  }, Boolean, 90000)
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
  page.setDefaultTimeout(18000)
  page.on('pageerror', error => report.pageErrors.push(clean(error.message)))
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(clean(message.text())) })
  await page.goto(url)
  await page.getByRole('button', { name: /^(Continue|继续|繼續)$/ }).click()
  await page.getByRole('button', { name: /^(Configure later|稍后配置|稍後設定)$/ }).click()
  const workspaceReady = await check('Choose an isolated cloud workspace in native DSH', async () => {
    if (await page.getByRole('button', { name: 'Choose workspace', exact: true }).isVisible().catch(() => false)) {
      const workspace = resolve('aiTemp/chat-workspace')
      await mkdir(workspace, { recursive: true })
      await page.getByRole('button', { name: 'Choose workspace', exact: true }).click()
      await page.getByRole('button', { name: 'Edit path', exact: true }).click()
      const path = page.locator('input:visible').last()
      await path.fill(workspace)
      await path.press('Enter')
      await page.getByRole('button', { name: 'Open', exact: true }).click()
    }
    await page.locator('textarea:visible,[contenteditable="true"]:visible').last().waitFor()
    await capture('native-workspace-ready')
  })
  await openSettings()
  await check('Native authentication and disconnected context guards', async () => {
    assert.equal((await fetch('http://127.0.0.1:3097/plugins/dsh-oauth-model-providers/oauth/openai-codex-oauth/status')).status, 401)
    const response = await api('openai-codex-oauth', '/context-window', { value: 500000 })
    assert.equal(response.status, 400)
    assert.equal((await codex()).body.contextWindow.selected, 252000)
  })
  await check('Cancel native OAuth flow without creating an account', async () => {
    const panel = root.locator('[data-provider-panel="codex"]')
    await panel.getByRole('button', { name: 'Connect account', exact: true }).click()
    await panel.getByRole('button', { name: 'Browser login (default)', exact: true }).waitFor()
    await panel.getByRole('button', { name: 'Cancel sign-in', exact: true }).click()
    await panel.getByRole('button', { name: 'Done', exact: true }).click()
    assert.equal((await codex()).body.accounts.length, 0)
  })
  const signedCodex = await check('Codex OAuth form -> simulated exchange -> native credential persistence', () => login('codex', 1))
  const signedClaude = await check('Claude OAuth form -> simulated exchange -> native credential persistence', () => login('claude', 1))
  if (signedCodex) {
    await check('Second Codex account and explicit active-account switching', async () => {
      const first = (await codex()).body.accounts[0].id
      await login('codex', 2)
      await root.locator('[data-provider-panel="codex"]').getByRole('button', { name: 'Use account', exact: true }).click()
      await poll(codex, value => value.body.accounts.find(a => a.id === first)?.active)
    })
    await check('Native quota display and account model/reset preferences', async () => {
      await tab(0)
      const panel = root.locator('[data-provider-panel="codex"]')
      await panel.getByText('82%', { exact: true }).first().waitFor()
      await panel.getByText('Advanced settings for this account', { exact: true }).first().click()
      await panel.getByRole('combobox', { name: /^Fallback model/ }).first().selectOption('gpt-cloud-qa')
      await poll(codex, value => value.body.accounts[0].failoverModel === 'gpt-cloud-qa')
      await panel.getByRole('checkbox', { name: /Automatically redeem/ }).first().click()
      await poll(codex, value => value.body.accounts[0].useResetCredit)
    })
    await check('Native account reasoning metadata and effort save', async () => {
      const before = (await codex()).body
      const account = before.accounts[0]
      const selected = before.failover.providers.find(p => p.id === 'openai-codex-oauth')
      const response = await api('openai-codex-oauth', '/account/failover-effort', { accountId: account.id, effortId: 'high' })
      report.reasoningEvidence = { advertisedUpstream: ['low', 'high'], nativeCatalog: selected, attemptedEffort: 'high', response }
      assert.equal(response.status, 200, 'Host rejects an effort advertised by the provider fixture')
      assert.ok(selected.models[0].efforts.length > 0)
    })
    await check('Native context presets/custom validation and saved readback', async () => {
      await tab(1)
      await root.getByRole('button', { name: '500K', exact: true }).click()
      await root.getByRole('button', { name: 'Apply context', exact: true }).click()
      await poll(codex, value => value.body.contextWindow.selected === 500000)
      await root.getByRole('button', { name: 'Custom', exact: true }).click()
      await root.getByLabel('Custom token count', { exact: true }).fill('251999')
      await root.getByRole('button', { name: 'Apply context', exact: true }).click()
      await root.getByText(/Enter an integer from/).waitFor()
      assert.equal((await codex()).body.contextWindow.selected, 500000)
      await root.getByLabel('Custom token count', { exact: true }).fill('777000')
      await root.getByRole('button', { name: 'Apply context', exact: true }).click()
      await poll(codex, value => value.body.contextWindow.selected === 777000)
      await page.keyboard.press('Escape')
      await openSettings(); await tab(1)
      await root.getByText('777K', { exact: true }).first().waitFor()
    })
  }
  await check('Native proxy add/default/provider assignment/removal and redaction', async () => {
    await tab(2)
    for (const name of ['Cloud QA primary', 'Cloud QA secondary']) {
      await root.getByLabel('Display name', { exact: true }).fill(name)
      await root.getByLabel('HTTP(S) proxy URL', { exact: true }).fill('http://qa-user:qa-password@proxy.invalid:' + (name.endsWith('secondary') ? '8081' : '8080'))
      await root.getByRole('button', { name: 'Add proxy', exact: true }).click()
      await root.getByText(name, { exact: true }).first().waitFor()
    }
    let status = (await codex()).body
    assert.equal(status.proxy.entries.length, 2)
    assert.equal(JSON.stringify(status).includes('qa-password'), false)
    const second = status.proxy.entries[1].id
    await root.getByRole('button', { name: 'Make default', exact: true }).click()
    await poll(codex, value => value.body.proxy.entries[0].id === second)
    await root.getByLabel('OpenAI Codex proxy route', { exact: true }).selectOption(second)
    await poll(codex, value => value.body.proxy.providerProxyId === second)
    await root.getByRole('button', { name: 'Remove', exact: true }).first().click()
    await root.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal((await codex()).body.proxy.entries.length, 2)
    await root.getByRole('button', { name: 'Remove', exact: true }).first().click()
    await root.getByRole('button', { name: 'Confirm removal', exact: true }).click()
    await poll(codex, value => value.body.proxy.entries.length === 1)
    await root.getByRole('button', { name: 'Remove', exact: true }).first().click()
    await root.getByRole('button', { name: 'Confirm removal', exact: true }).click()
    await poll(codex, value => value.body.proxy.entries.length === 0)
  })
  if (signedClaude) await check('Native provider fallback enable/model/effort persistence', async () => {
    await tab(3)
    const card = root.locator('article').filter({ has: page.getByRole('heading', { name: 'Anthropic Claude (OAuth)', exact: true }) })
    await card.getByRole('checkbox', { name: 'Allow this destination', exact: true }).click()
    await poll(codex, value => value.body.failover.providers.find(p => p.id === 'anthropic-oauth')?.enabled)
    await card.getByRole('combobox', { name: /^Destination model/ }).selectOption('claude-sonnet-cloud-qa')
    await poll(codex, value => value.body.failover.providers.find(p => p.id === 'anthropic-oauth')?.model === 'claude-sonnet-cloud-qa')
    assert.equal(await card.getByRole('combobox', { name: /^Reasoning effort/ }).isEnabled(), true, 'Native reasoning effort control is disabled')
    await card.getByRole('combobox', { name: /^Reasoning effort/ }).selectOption('high')
    await poll(codex, value => value.body.failover.providers.find(p => p.id === 'anthropic-oauth')?.effort === 'high')
  })
  await check('Diagnostics export contains state but excludes credential/proxy secrets', async () => {
    await tab(4)
    const text = await download(root.getByRole('button', { name: 'Export diagnostics', exact: true }), 'diagnostics.json')
    const data = JSON.parse(text)
    assert.equal(data.providers.length, 2)
    assert.ok(data.providers.every(p => p.statusAvailable))
    assert.ok(!text.includes('qa-password') && !text.includes('qa-codex-refresh') && !text.includes('sk-ant-oat01'))
  })
  await check('Handoff draft survives tabs and both real downloads contain the draft', async () => {
    await tab(5)
    await root.getByLabel('Task goal', { exact: true }).fill('Cloud-only functional QA')
    await root.getByLabel('Completed work and important decisions', { exact: true }).fill('Tested in the hosted runner using simulated providers.')
    await root.getByLabel('Next steps (one per line)', { exact: true }).fill('Inspect the screenshots')
    await root.getByLabel('Workspace-relative paths (one per line)', { exact: true }).fill('README.md')
    await tab(0); await tab(5)
    assert.equal(await root.getByLabel('Task goal', { exact: true }).inputValue(), 'Cloud-only functional QA')
    await root.locator('[role="tabpanel"]:not([hidden])').getByRole('checkbox').check()
    const md = await download(root.getByRole('button', { name: 'Export readable summary', exact: true }), 'handoff.md')
    assert.ok(md.includes('Cloud-only functional QA'))
    const data = JSON.parse(await download(root.getByRole('button', { name: 'Export handoff JSON', exact: true }), 'handoff.json'))
    assert.equal(data.goal, 'Cloud-only functional QA')
  })
  await check('Capture all six native tabs in both languages at three viewport sizes', layoutSweep)
  await tab(0)
  await writeFile(join(output, 'native-status.json'), JSON.stringify({ codex: (await codex()).body, claude: (await claude()).body }, null, 2))
  await page.keyboard.press('Escape')
  await writeFile(join(output, 'chat-controls.json'), JSON.stringify(await page.locator('button,input,textarea,[contenteditable=true]').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).map(n => ({ tag: n.tagName, role: n.getAttribute('role'), label: n.getAttribute('aria-label'), placeholder: n.getAttribute('placeholder'), text: n.textContent?.trim().slice(0, 150) }))), null, 2))
  await capture('native-chat-after-settings')
  let codexChat = false
  if (workspaceReady && signedCodex) {
    codexChat = await check('Native model picker, composer context and Codex request/response', async () => {
      await page.getByRole('button', { name: /DeepSeek-V41-Flash|DeepSeek-V4-Pro|Select model/ }).last().click()
      await page.getByText('Model', { exact: true }).click()
      await page.getByText('Cloud QA Codex', { exact: true }).click()
      await page.locator('[data-active-provider="codex"]').waitFor()
      await page.getByRole('button', { name: 'Manage OpenAI context', exact: true }).waitFor()
      const input = page.locator('textarea:visible,[contenteditable="true"]:visible').last()
      await input.fill('Send a short test reply.')
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      await page.getByText('CLOUD_QA_RESPONSE_OK', { exact: true }).waitFor()
      await capture('native-codex-response')
    })
    if (codexChat) await check('Native Code review command queues a model turn', async () => {
      await page.getByRole('button', { name: 'Start review', exact: true }).click()
      await page.getByText(/Code review started for/).first().waitFor()
      await poll(() => page.getByText('CLOUD_QA_RESPONSE_OK', { exact: true }).count(), count => count >= 2)
      await capture('native-code-review')
    })
  }
  if (workspaceReady && signedClaude) await check('Native Claude model switch and request/response', async () => {
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /Cloud QA Codex|DeepSeek-V41-Flash|DeepSeek-V4-Pro/ }).last().click()
    await page.getByText('Model', { exact: true }).click()
    await page.getByText('Cloud QA Claude', { exact: true }).click()
    await page.locator('[data-active-provider="claude"]').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Manage OpenAI context', exact: true }).count(), 0)
    await page.locator('textarea:visible,[contenteditable="true"]:visible').last().fill('Send another short test reply.')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.getByText('CLOUD_QA_CLAUDE_OK', { exact: true }).waitFor()
    await capture('native-claude-response')
  })
  await check('Native sign-out confirmation and removal from local credential state', async () => {
    await openSettings(); await tab(0)
    const panel = root.locator('[data-provider-panel="claude"]')
    await panel.getByRole('button', { name: 'Sign out', exact: true }).click()
    await panel.getByRole('button', { name: 'Keep signed in', exact: true }).click()
    assert.equal((await claude()).body.connected, true)
    await panel.getByRole('button', { name: 'Sign out', exact: true }).click()
    await panel.getByRole('button', { name: 'Confirm sign out', exact: true }).click()
    await poll(claude, value => !value.body.connected && value.body.accounts.length === 0)
  })
  await check('No uncaught browser application errors', async () => assert.deepEqual(report.pageErrors, []))
} catch (error) {
  report.checks.push({ name: 'Cloud native DSH setup', status: 'fail', error: clean(error.stack ?? error) })
  if (page) { await capture('setup-failure').catch(() => {}); await writeFile(join(output, 'setup-page.txt'), clean(await page.locator('body').innerText().catch(() => ''))) }
} finally {
  await writeFile(join(output, 'host.log'), clean(boot))
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser?.close()
  if (host && host.exitCode === null) { const done = once(host, 'exit'); host.kill('SIGTERM'); await Promise.race([done, new Promise(resolve => setTimeout(resolve, 3000))]); if (host.exitCode === null) host.kill('SIGKILL') }
}
console.log(JSON.stringify({ checks: report.checks, layouts: report.layouts.length, visualFlags: report.layouts.filter(l => l.horizontalOverflow || l.controlsOutside.length).map(l => ({ label: l.label, overflow: l.horizontalOverflow, outside: l.controlsOutside })), pageErrors: report.pageErrors }, null, 2))
if (report.checks.some(c => c.status === 'fail')) process.exitCode = 1
