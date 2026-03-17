import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseMeetingVideoList } from '../../src/parsers/meeting-video-list.js'
import { ParserStructureError, CloudflareChallengeError } from '../../src/errors.js'

const fixturesDir = join(import.meta.dirname, '..', 'fixtures')

describe('parseMeetingVideoList', () => {
  it('parses real Senate video meeting list', () => {
    const html = readFileSync(join(fixturesDir, 'meetings-senate-vid.html'), 'utf-8')
    const meetings = parseMeetingVideoList(html)

    expect(meetings.length).toBeGreaterThan(10)

    // Check first meeting structure
    const first = meetings[0]
    expect(first.key).toBeGreaterThan(0)
    expect(first.date).toBeTruthy()
    expect(first.duration).toMatch(/^\d+:\d{2}:\d{2}$/)
    expect(first.videoUrl).toContain('video.scstatehouse.gov/mp4/')
    expect(first.committeeName).toBeTruthy()
  })

  it('extracts meeting keys correctly', () => {
    const html = readFileSync(join(fixturesDir, 'meetings-senate-vid.html'), 'utf-8')
    const meetings = parseMeetingVideoList(html)

    // Verify known meeting from fixture (key 16194)
    const known = meetings.find((m) => m.key === 16194)
    expect(known).toBeDefined()
    expect(known!.committeeName).toContain('Finance')
    expect(known!.chamber).toBe('S')
  })

  it('extracts download URLs', () => {
    const html = readFileSync(join(fixturesDir, 'meetings-senate-vid.html'), 'utf-8')
    const meetings = parseMeetingVideoList(html)

    for (const m of meetings.slice(0, 5)) {
      expect(m.downloadUrls.length).toBeGreaterThan(0)
      expect(m.downloadUrls[0]).toMatch(/^https:\/\/video\.scstatehouse\.gov\/mp4\/.*\.mp4$/)
    }
  })

  it('returns empty array for genuinely empty page', () => {
    const html = '<html><body><p>No meetings found.</p></body></html>'
    const meetings = parseMeetingVideoList(html)
    expect(meetings).toEqual([])
  })

  it('throws CloudflareChallengeError for CF page', () => {
    const cfHtml = '<html><head><title>Just a moment...</title></head><body>CF challenge</body></html>'
    expect(() => parseMeetingVideoList(cfHtml)).toThrow(CloudflareChallengeError)
  })
})
