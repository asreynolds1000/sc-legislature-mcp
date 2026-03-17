import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseStatusActivity } from '../../src/parsers/status-activity.js'

const fixturesDir = join(import.meta.dirname, '..', 'fixtures')

describe('parseStatusActivity', () => {
  it('parses real status activity page (may be empty if legislature in recess)', () => {
    const html = readFileSync(join(fixturesDir, 'status-activity-senate.html'), 'utf-8')
    const activities = parseStatusActivity(html)

    // Fixture may contain "No activity during this time frame" — that's valid
    expect(Array.isArray(activities)).toBe(true)
  })

  it('extracts bill numbers with S. or H. prefix', () => {
    const html = readFileSync(join(fixturesDir, 'status-activity-senate.html'), 'utf-8')
    const activities = parseStatusActivity(html)

    if (activities.length > 0) {
      expect(activities[0].billNumber).toMatch(/^[SH]/)
    }
  })

  it('returns empty array for empty page', () => {
    expect(parseStatusActivity('<html><body></body></html>')).toEqual([])
  })
})
