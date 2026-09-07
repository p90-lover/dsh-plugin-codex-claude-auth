/** Redact common credential-bearing diagnostics before they reach a browser or log. */
export function publicError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/([?&#](?:code|state|access_token|refresh_token|id_token)=)[^&#\s]+/giu, '$1[redacted]')
    .replace(/(https?:\/\/)[^/\s@]+@/giu, '$1[redacted]@')
    .replace(/\bBearer\s+[^\s;,"'}]+/giu, 'Bearer [redacted]')
    .replace(/(["']?(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|authorization|cookie)["']?\s*[:=]\s*)["'][^"'\r\n]*["']/giu, '$1"[redacted]"')
    .replace(/\b(?:sk-|ac_)[A-Za-z0-9._-]{8,}\b/gu, '[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[redacted]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .slice(0, 2048)
}
