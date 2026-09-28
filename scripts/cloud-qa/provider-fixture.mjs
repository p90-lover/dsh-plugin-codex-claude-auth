import { appendFileSync } from 'node:fs'
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('This test fixture only runs in hosted CI.')
const realFetch = globalThis.fetch
const log = process.env.QA_WIRE_LOG
let codexAccount = 0, claudeAccount = 0
const note = (kind, extra = {}) => { if (log) appendFileSync(log, JSON.stringify({ kind, ...extra }) + '\n') }
const json = value => Response.json(value)
const jwt = value => Buffer.from('{}').toString('base64url') + '.' + Buffer.from(JSON.stringify(value)).toString('base64url') + '.qa-signature'
const stream = events => new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } })
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url)
  if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return realFetch(input, init)
  if (url.hostname === 'auth.openai.com' && url.pathname === '/oauth/token') {
    const id = ++codexAccount
    note('codex-token-exchange', { account: id })
    return json({ access_token: jwt({ email: 'cloud-qa-' + id + '@example.test', 'https://api.openai.com/auth': { chatgpt_account_id: 'cloud-qa-' + id } }), refresh_token: 'qa-codex-refresh-' + id, expires_in: 3600 })
  }
  if (url.hostname === 'platform.claude.com' && url.pathname === '/v1/oauth/token') {
    const id = ++claudeAccount
    note('claude-token-exchange', { account: id })
    return json({ access_token: 'sk-ant-oat01-cloud-qa-' + id, refresh_token: 'qa-claude-refresh-' + id, expires_in: 3600 })
  }
  if (url.hostname === 'chatgpt.com' && url.pathname.endsWith('/codex/models')) {
    note('codex-catalog')
    return json({ models: [{ slug: 'gpt-cloud-qa', display_name: 'Cloud QA Codex', visibility: 'list', context_window: 1000000, max_output_tokens: 32000, input_modalities: ['text'], supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }] }] })
  }
  if (url.hostname === 'api.anthropic.com' && url.pathname === '/v1/models') {
    note('claude-catalog')
    return json({ data: [{ type: 'model', id: 'claude-sonnet-cloud-qa', display_name: 'Cloud QA Claude', max_input_tokens: 1000000, max_tokens: 32000, capabilities: { thinking: { supported: true }, effort: { supported: true, low: { supported: true }, high: { supported: true } } } }], has_more: false })
  }
  if (url.hostname === 'chatgpt.com' && url.pathname.endsWith('/wham/usage')) {
    note('codex-usage')
    return json({ rate_limit: { primary_window: { used_percent: 18, reset_at: 2000000000, limit_window_seconds: 18000 } }, rate_limit_reset_credits: { available_count: 2 } })
  }
  if (url.hostname === 'api.anthropic.com' && url.pathname === '/api/oauth/usage') {
    note('claude-usage')
    return json({ five_hour: { utilization: 18, resets_at: '2033-05-18T03:33:20Z' }, seven_day: { utilization: 35, resets_at: '2033-05-20T03:33:20Z' } })
  }
  if (url.hostname === 'chatgpt.com' && url.pathname.endsWith('/responses')) {
    const body = JSON.parse(String(init?.body ?? '{}'))
    note('codex-inference', { model: body.model, effort: body.reasoning?.effort, tools: body.tools?.length ?? 0 })
    const output = { type: 'message', id: 'msg_qa', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'CLOUD_QA_RESPONSE_OK', annotations: [] }] }
    return stream([
      { type: 'response.created', response: { id: 'resp_qa', status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { ...output, status: 'in_progress', content: [] } },
      { type: 'response.content_part.added', item_id: 'msg_qa', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', item_id: 'msg_qa', output_index: 0, content_index: 0, delta: 'CLOUD_QA_RESPONSE_OK' },
      { type: 'response.output_text.done', item_id: 'msg_qa', output_index: 0, content_index: 0, text: 'CLOUD_QA_RESPONSE_OK' },
      { type: 'response.content_part.done', item_id: 'msg_qa', output_index: 0, content_index: 0, part: output.content[0] },
      { type: 'response.output_item.done', output_index: 0, item: output },
      { type: 'response.completed', response: { id: 'resp_qa', status: 'completed', output: [output], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } },
    ])
  }
  if (url.hostname === 'api.anthropic.com' && url.pathname === '/v1/messages') {
    const body = JSON.parse(String(init?.body ?? '{}'))
    note('claude-inference', { model: body.model })
    return stream([
      { type: 'message_start', message: { id: 'qa_claude', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'CLOUD_QA_CLAUDE_OK' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ])
  }
  note('blocked-outbound', { host: url.hostname, path: url.pathname })
  return Response.json({ error: { message: 'Cloud QA blocked an unmocked outbound request.' } }, { status: 503 })
}
