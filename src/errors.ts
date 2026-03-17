/**
 * Error categories for consistent tool responses.
 * Each error type maps to LLM-friendly guidance.
 */

export class ParserStructureError extends Error {
  readonly category = 'structure_changed' as const
  readonly guidance = 'Page structure may have changed. Try again later or report the issue.'

  constructor(context: string, detail: string) {
    super(`[${context}] Structure validation failed: ${detail}`)
    this.name = 'ParserStructureError'
  }
}

export class CloudflareChallengeError extends Error {
  readonly category = 'rate_limited' as const
  readonly guidance = 'Request was blocked by Cloudflare protection. Wait a moment and retry.'

  constructor() {
    super('Cloudflare challenge page detected instead of expected content')
    this.name = 'CloudflareChallengeError'
  }
}

export class RateLimitError extends Error {
  readonly category = 'rate_limited' as const
  readonly guidance = 'Too many requests to the legislature site. Wait and retry.'

  constructor(status?: number) {
    super(`Rate limited${status ? ` (HTTP ${status})` : ''}`)
    this.name = 'RateLimitError'
  }
}

export class NetworkError extends Error {
  readonly category = 'network_error' as const
  readonly guidance = 'Legislature site is unreachable. Try again later.'

  constructor(detail: string) {
    super(`Network error: ${detail}`)
    this.name = 'NetworkError'
  }
}

/** Format any error into a consistent MCP tool error response */
export function formatToolError(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  if (error instanceof ParserStructureError ||
      error instanceof CloudflareChallengeError ||
      error instanceof RateLimitError ||
      error instanceof NetworkError) {
    return {
      content: [{ type: 'text', text: `Error [${error.category}]: ${error.message}\n\n${error.guidance}` }],
      isError: true,
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  }
}
