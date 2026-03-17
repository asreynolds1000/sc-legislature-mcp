import { describe, it, expect } from 'vitest'
import {
  ParserStructureError,
  CloudflareChallengeError,
  RateLimitError,
  NetworkError,
  formatToolError,
} from '../../src/errors.js'

describe('Error classes', () => {
  it('ParserStructureError has correct category and guidance', () => {
    const err = new ParserStructureError('test-parser', 'missing table')
    expect(err.category).toBe('structure_changed')
    expect(err.guidance).toContain('structure')
    expect(err.message).toContain('test-parser')
    expect(err.message).toContain('missing table')
  })

  it('CloudflareChallengeError has correct category', () => {
    const err = new CloudflareChallengeError()
    expect(err.category).toBe('rate_limited')
    expect(err.guidance).toContain('Cloudflare')
  })

  it('RateLimitError includes status code', () => {
    const err = new RateLimitError(429)
    expect(err.message).toContain('429')
    expect(err.category).toBe('rate_limited')
  })

  it('NetworkError includes detail', () => {
    const err = new NetworkError('timeout')
    expect(err.message).toContain('timeout')
    expect(err.category).toBe('network_error')
  })
})

describe('formatToolError', () => {
  it('formats known error types with category and guidance', () => {
    const err = new ParserStructureError('ctx', 'detail')
    const result = formatToolError(err)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('structure_changed')
    expect(result.content[0].text).toContain('detail')
  })

  it('formats unknown errors gracefully', () => {
    const result = formatToolError(new Error('something broke'))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('something broke')
  })

  it('formats string errors', () => {
    const result = formatToolError('raw string error')
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('raw string error')
  })
})
