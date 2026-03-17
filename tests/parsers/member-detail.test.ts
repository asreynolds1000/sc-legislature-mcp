import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseMemberDetail, parseMemberRoster } from '../../src/parsers/member-detail.js'

const fixturesDir = join(import.meta.dirname, '..', 'fixtures')

describe('parseMemberDetail', () => {
  it('parses Senator Brian Adams profile', () => {
    const html = readFileSync(join(fixturesDir, 'member-detail-0002272727.html'), 'utf-8')
    const member = parseMemberDetail(html)

    expect(member.name).toContain('Brian Adams')
    expect(member.memberCode).toBe('0002272727')
    expect(member.chamber).toBe('S')
    expect(member.district).toContain('44')
    expect(member.photoUrl).toContain('/images/members/0002272727.jpg')
  })

  it('extracts phone number', () => {
    const html = readFileSync(join(fixturesDir, 'member-detail-0002272727.html'), 'utf-8')
    const member = parseMemberDetail(html)

    expect(member.phone).toMatch(/\d{3}-\d{3}-\d{4}/)
  })

  it('extracts committee assignments', () => {
    const html = readFileSync(join(fixturesDir, 'member-detail-0002272727.html'), 'utf-8')
    const member = parseMemberDetail(html)

    expect(member.committees.length).toBeGreaterThan(0)
    expect(member.committees).toContain('Judiciary')
  })

  it('extracts district map URL', () => {
    const html = readFileSync(join(fixturesDir, 'member-detail-0002272727.html'), 'utf-8')
    const member = parseMemberDetail(html)

    expect(member.districtMapUrl).toContain('/maps/')
  })
})

describe('parseMemberRoster', () => {
  it('parses Senate roster', () => {
    const html = readFileSync(join(fixturesDir, 'member-roster-senate.html'), 'utf-8')
    const members = parseMemberRoster(html)

    expect(members.length).toBeGreaterThan(30) // SC Senate has 46 members
  })

  it('extracts member codes', () => {
    const html = readFileSync(join(fixturesDir, 'member-roster-senate.html'), 'utf-8')
    const members = parseMemberRoster(html)

    for (const m of members.slice(0, 5)) {
      expect(m.memberCode).toMatch(/^\d+$/)
      expect(m.name).toBeTruthy()
    }
  })
})
