import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseDelegation } from '../../src/parsers/delegation.js'

const fixturesDir = join(import.meta.dirname, '..', 'fixtures')

describe('parseDelegation', () => {
  it('parses Greenville delegation', () => {
    const html = readFileSync(join(fixturesDir, 'delegation-greenville.html'), 'utf-8')
    const members = parseDelegation(html)

    expect(members.length).toBeGreaterThan(10) // Greenville is a large county
  })

  it('extracts member names and districts', () => {
    const html = readFileSync(join(fixturesDir, 'delegation-greenville.html'), 'utf-8')
    const members = parseDelegation(html)

    for (const m of members.slice(0, 3)) {
      expect(m.name).toBeTruthy()
      expect(m.memberCode).toBeTruthy()
    }
  })

  it('includes both senators and representatives', () => {
    const html = readFileSync(join(fixturesDir, 'delegation-greenville.html'), 'utf-8')
    const members = parseDelegation(html)

    const senators = members.filter((m) => m.chamber === 'S')
    const reps = members.filter((m) => m.chamber === 'H')

    expect(senators.length).toBeGreaterThan(0)
    expect(reps.length).toBeGreaterThan(0)
  })

  it('returns empty array for empty page', () => {
    expect(parseDelegation('<html><body></body></html>')).toEqual([])
  })
})
