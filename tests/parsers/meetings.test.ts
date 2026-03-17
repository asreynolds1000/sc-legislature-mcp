import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseMeetings } from '../../src/parsers/meetings.js'

const fixturesDir = join(import.meta.dirname, '..', 'fixtures')

describe('parseMeetings', () => {
  it('parses real Senate meetings page', () => {
    const html = readFileSync(join(fixturesDir, 'meetings-senate.html'), 'utf-8')
    const meetings = parseMeetings(html)

    expect(meetings.length).toBeGreaterThan(5)
  })

  it('extracts agenda URLs', () => {
    const html = readFileSync(join(fixturesDir, 'meetings-senate.html'), 'utf-8')
    const meetings = parseMeetings(html)
    const withAgenda = meetings.filter((m) => m.agendaUrl)

    expect(withAgenda.length).toBeGreaterThan(0)
    expect(withAgenda[0].agendaUrl).toContain('/agendas/')
  })

  it('extracts bill numbers from agenda', () => {
    const html = readFileSync(join(fixturesDir, 'meetings-senate.html'), 'utf-8')
    const meetings = parseMeetings(html)
    const withBills = meetings.filter((m) => m.billsOnAgenda.length > 0)

    expect(withBills.length).toBeGreaterThan(0)
    expect(withBills[0].billsOnAgenda[0]).toMatch(/^\d+$/)
  })

  it('returns empty array for empty page', () => {
    expect(parseMeetings('<html><body></body></html>')).toEqual([])
  })
})
