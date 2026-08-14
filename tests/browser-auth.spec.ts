import { describe, expect, it, vi } from 'vitest'
import { BrowserOAuthFlow } from '../src/browser-auth.ts'

describe('BrowserOAuthFlow', () => {
  it('moves the Settings wizard from method selection to automatic callback completion', async () => {
    let finishCallback: (() => void) | undefined
    const callback = new Promise<void>((resolve) => { finishCallback = resolve })
    const flow = new BrowserOAuthFlow('OpenAI Codex (OAuth)')

    flow.start(async interaction => {
      const method = await interaction.prompt({
        type: 'select',
        message: 'Select login method',
        options: [{ id: 'browser', label: 'Browser login' }],
      })
      expect(method).toBe('browser')

      interaction.notify({ type: 'auth_url', url: 'https://auth.example/authorize?state=public-state' })
      const manualAbort = new AbortController()
      const manualPrompt = interaction.prompt({
        type: 'manual_code',
        message: 'Paste returned URL',
        signal: manualAbort.signal,
      }).catch(() => '')
      await callback
      manualAbort.abort()
      await manualPrompt
    })

    await vi.waitFor(() => { expect(flow.snapshot().prompt?.type).toBe('select') })
    const select = flow.snapshot().prompt!
    flow.respond(select.id, 'browser')

    await vi.waitFor(() => {
      const state = flow.snapshot()
      expect(state.authUrl).toContain('https://auth.example/')
      expect(state.prompt?.type).toBe('manual_code')
      expect(state.phase).toBe('input')
    })

    finishCallback?.()
    await vi.waitFor(() => {
      expect(flow.snapshot()).toMatchObject({ phase: 'complete', connected: true })
    })
  })

  it('rejects the active provider prompt when Settings cancels the flow', async () => {
    const flow = new BrowserOAuthFlow('OpenAI Codex (OAuth)')
    let providerCleanedUp = false

    flow.start(async interaction => {
      try {
        await interaction.prompt({
          type: 'manual_code',
          message: 'Waiting for callback',
        })
      } finally {
        providerCleanedUp = true
      }
    })

    await vi.waitFor(() => { expect(flow.snapshot().prompt?.type).toBe('manual_code') })
    flow.cancel()

    await vi.waitFor(() => { expect(providerCleanedUp).toBe(true) })
    expect(flow.snapshot()).toMatchObject({ phase: 'cancelled', connected: false })
  })
})
