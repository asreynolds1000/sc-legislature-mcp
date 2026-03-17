import { describe, it, expect } from 'vitest'
import { sessionNumber, sessionYears, currentSession, sessionSuffix } from '../../src/data/sessions.js'

describe('sessionNumber', () => {
  it('maps 1975 to session 101', () => {
    expect(sessionNumber(1975)).toBe(101)
  })

  it('maps 1976 to session 101 (same biennium)', () => {
    expect(sessionNumber(1976)).toBe(101)
  })

  it('maps 2025 to session 126', () => {
    expect(sessionNumber(2025)).toBe(126)
  })

  it('maps 2026 to session 126', () => {
    expect(sessionNumber(2026)).toBe(126)
  })

  it('maps 2023 to session 125', () => {
    expect(sessionNumber(2023)).toBe(125)
  })

  it('throws for year before 1975', () => {
    expect(() => sessionNumber(1974)).toThrow()
  })
})

describe('sessionYears', () => {
  it('returns "1975-1976" for session 101', () => {
    expect(sessionYears(101)).toBe('1975-1976')
  })

  it('returns "2025-2026" for session 126', () => {
    expect(sessionYears(126)).toBe('2025-2026')
  })
})

describe('currentSession', () => {
  it('returns a valid session number', () => {
    const session = currentSession()
    expect(session).toBeGreaterThanOrEqual(126)
  })
})

describe('sessionSuffix', () => {
  it('returns last 2 digits', () => {
    expect(sessionSuffix(126)).toBe('26')
    expect(sessionSuffix(101)).toBe('01')
  })
})
