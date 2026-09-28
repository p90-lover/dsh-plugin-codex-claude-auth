import { expect, it } from 'vitest'
import { createHandoff, parseHandoff, renderHandoff, preflightHandoff } from '../src/handoff.ts'
const input = { goal: 'Fix UI', summary: 'Updated provider cards', nextSteps: ['Run UI tests'], files: ['src/client/index.tsx'] }
it('creates a bounded portable task packet without provider replay state', () => {
  const packet = createHandoff(input)
  expect(parseHandoff(JSON.stringify(packet))).toEqual(packet)
  expect(renderHandoff(packet)).toContain('Run UI tests')
  expect(packet).not.toHaveProperty('credentials')
})
it('refuses unknown privileged fields and secret-shaped text', () => {
  expect(() => parseHandoff(JSON.stringify({ ...createHandoff(input), credentials: { token: 'x' } }))).toThrow(/field/i)
  expect(() => createHandoff({ ...input, summary: 'Bearer abcdefghijklmnop' })).toThrow(/secret/i)
  expect(() => createHandoff({ ...input, files: ['../../.codex/auth.json'] })).toThrow(/path/i)
})
it('blocks a handoff with unfinished work or an unverified destination', () => {
  const packet = createHandoff(input)
  expect(preflightHandoff(packet, { authenticated: false, acceptsTaskPacket: true }, { running: false, pendingToolCalls: 0 }).ok).toBe(false)
  expect(preflightHandoff(packet, { authenticated: true, acceptsTaskPacket: true }, { running: true, pendingToolCalls: 1 }).ok).toBe(false)
  expect(preflightHandoff(packet, { authenticated: true, acceptsTaskPacket: true }, { running: false, pendingToolCalls: 0 }).ok).toBe(true)
})
