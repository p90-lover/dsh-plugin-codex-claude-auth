import { describe, expect, it } from 'vitest'
import { publicError } from '../src/public-error.ts'

describe('public diagnostics', () => {
  it('removes bearer, JSON token and proxy credentials while retaining an actionable error', () => {
    const text = publicError(new Error('HTTP 401 Authorization: Bearer token-that-must-not-leak; {"access_token":"token-secret-123", "refreshToken":"refresh-secret-456"} https://alice:p%40ss@proxy.test:8080'))
    expect(text).toContain('HTTP 401')
    for (const secret of ['token-that-must-not-leak', 'token-secret-123', 'refresh-secret-456', 'alice', 'p%40ss']) expect(text).not.toContain(secret)
  })
  it('bounds untrusted error messages and strips terminal control sequences', () => {
    const text = publicError(new Error('\x1b[31m' + 'x'.repeat(8000)))
    expect(text.length).toBeLessThanOrEqual(2048)
    expect(text).not.toContain('\x1b')
  })
})
