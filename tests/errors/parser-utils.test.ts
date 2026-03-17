import { describe, it, expect } from 'vitest'
import { parse } from 'node-html-parser'
import {
  isCloudflareChallenge,
  rejectIfCloudflare,
  assertHasTable,
  assertColumnHeaders,
  safeParse,
} from '../../src/parsers/parser-utils.js'
import { ParserStructureError, CloudflareChallengeError } from '../../src/errors.js'

describe('isCloudflareChallenge', () => {
  it('detects "Just a moment" title', () => {
    expect(isCloudflareChallenge('<title>Just a moment...</title>')).toBe(true)
  })

  it('detects cf-browser-verification', () => {
    expect(isCloudflareChallenge('<div id="cf-browser-verification">')).toBe(true)
  })

  it('detects challenges.cloudflare.com', () => {
    expect(isCloudflareChallenge('<script src="https://challenges.cloudflare.com/...">')).toBe(true)
  })

  it('does not flag normal HTML', () => {
    expect(isCloudflareChallenge('<html><body><table></table></body></html>')).toBe(false)
  })
})

describe('rejectIfCloudflare', () => {
  it('throws on CF challenge page', () => {
    expect(() => rejectIfCloudflare('<title>Just a moment...</title>')).toThrow(CloudflareChallengeError)
  })

  it('does not throw on normal HTML', () => {
    expect(() => rejectIfCloudflare('<html><body>OK</body></html>')).not.toThrow()
  })
})

describe('assertHasTable', () => {
  it('passes when table exists', () => {
    const root = parse('<html><body><table><tr><td>data</td></tr></table></body></html>')
    expect(() => assertHasTable(root, 'test')).not.toThrow()
  })

  it('throws when no table found', () => {
    const root = parse('<html><body><p>No tables here</p></body></html>')
    expect(() => assertHasTable(root, 'test')).toThrow(ParserStructureError)
  })
})

describe('assertColumnHeaders', () => {
  it('passes when expected headers present', () => {
    const root = parse('<tr><th>Name</th><th>Date</th><th>Status</th></tr>')
    expect(() => assertColumnHeaders(root, ['name', 'date'], 'test')).not.toThrow()
  })

  it('throws when expected header missing', () => {
    const root = parse('<tr><th>Name</th><th>Status</th></tr>')
    expect(() => assertColumnHeaders(root, ['name', 'date'], 'test')).toThrow(ParserStructureError)
  })

  it('throws on null row', () => {
    expect(() => assertColumnHeaders(null, ['name'], 'test')).toThrow(ParserStructureError)
  })
})

describe('safeParse', () => {
  it('returns root for valid HTML', () => {
    const root = safeParse('<html><body>OK</body></html>', 'test')
    expect(root).toBeDefined()
  })

  it('throws on empty HTML', () => {
    expect(() => safeParse('', 'test')).toThrow(ParserStructureError)
  })

  it('throws on CF challenge', () => {
    expect(() => safeParse('<title>Just a moment...</title>', 'test')).toThrow(CloudflareChallengeError)
  })
})
