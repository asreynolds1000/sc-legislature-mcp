import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseCommitteeList } from '../../src/parsers/committee-list.js'

const fixturesDir = join(import.meta.dirname, '..', 'fixtures')

describe('parseCommitteeList', () => {
  it('parses Senate committees', () => {
    const html = readFileSync(join(fixturesDir, 'committees-senate.html'), 'utf-8')
    const committees = parseCommitteeList(html, 'S')

    expect(committees.length).toBeGreaterThan(5)
  })

  it('extracts committee names and abbreviations', () => {
    const html = readFileSync(join(fixturesDir, 'committees-senate.html'), 'utf-8')
    const committees = parseCommitteeList(html, 'S')

    const judiciary = committees.find((c) => c.abbreviation === 'jud')
    expect(judiciary).toBeDefined()
    expect(judiciary!.name).toContain('Judiciary')
  })

  it('extracts members with codes', () => {
    const html = readFileSync(join(fixturesDir, 'committees-senate.html'), 'utf-8')
    const committees = parseCommitteeList(html, 'S')

    for (const c of committees.slice(0, 3)) {
      expect(c.members.length).toBeGreaterThan(0)
      expect(c.members[0].memberCode).toMatch(/^\d+$/)
      expect(c.members[0].name).toBeTruthy()
    }
  })

  it('returns empty array for empty page', () => {
    expect(parseCommitteeList('<html><body></body></html>', 'S')).toEqual([])
  })
})
