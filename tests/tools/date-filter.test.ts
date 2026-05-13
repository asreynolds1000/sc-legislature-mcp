import { describe, it, expect } from 'vitest'
import { dateToLocalIso, filterByDateRange } from '../../src/tools/video.js'
import type { VideoMeeting } from '../../src/types.js'

function makeMeeting(date: string, key = 1): VideoMeeting {
  return {
    key,
    date,
    chamber: 'S',
    committeeName: 'Senate -- Senate',
    duration: '1:00:00',
    partNumber: 1,
    videoUrl: `https://video.scstatehouse.gov/mp4/test${key}_1.mp4`,
    downloadUrls: [`https://video.scstatehouse.gov/mp4/test${key}_1.mp4`],
  }
}

describe('dateToLocalIso', () => {
  it('converts a Date to YYYY-MM-DD using local time', () => {
    const d = new Date(2026, 4, 12) // May 12, 2026 local midnight
    expect(dateToLocalIso(d)).toBe('2026-05-12')
  })

  it('pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5) // Jan 5, 2026
    expect(dateToLocalIso(d)).toBe('2026-01-05')
  })

  it('handles December correctly', () => {
    const d = new Date(2026, 11, 31) // Dec 31, 2026
    expect(dateToLocalIso(d)).toBe('2026-12-31')
  })

  it('matches today regardless of UTC offset', () => {
    const now = new Date()
    const iso = dateToLocalIso(now)
    expect(iso).toBe(
      now.getFullYear() + '-'
      + String(now.getMonth() + 1).padStart(2, '0') + '-'
      + String(now.getDate()).padStart(2, '0'),
    )
  })
})

describe('filterByDateRange', () => {
  it('includes meetings on the exact from date', () => {
    const meetings = [makeMeeting('Tuesday, May 12, 2026')]
    const result = filterByDateRange(meetings, '2026-05-12', '2026-05-12')
    expect(result).toHaveLength(1)
  })

  it('includes meetings on the exact to date', () => {
    const meetings = [makeMeeting('Wednesday, May 13, 2026')]
    const result = filterByDateRange(meetings, '2026-05-10', '2026-05-13')
    expect(result).toHaveLength(1)
  })

  it('excludes meetings outside the range', () => {
    const meetings = [
      makeMeeting('Monday, May 11, 2026', 1),
      makeMeeting('Tuesday, May 12, 2026', 2),
      makeMeeting('Wednesday, May 13, 2026', 3),
    ]
    const result = filterByDateRange(meetings, '2026-05-12', '2026-05-12')
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe(2)
  })

  it('includes today in a 30-day range ending today', () => {
    const now = new Date()
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()]
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const dateStr = `${dayName}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`
    const todayIso = dateToLocalIso(now)

    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const fromIso = dateToLocalIso(thirtyDaysAgo)

    const meetings = [makeMeeting(dateStr)]
    const result = filterByDateRange(meetings, fromIso, todayIso)
    expect(result).toHaveLength(1)
  })

  it('handles date format without day name (e.g. "May 12, 2026")', () => {
    const meetings = [makeMeeting('May 12, 2026')]
    const result = filterByDateRange(meetings, '2026-05-12', '2026-05-12')
    expect(result).toHaveLength(1)
  })

  it('passes through meetings with unparseable dates', () => {
    const meetings = [makeMeeting('not a real date')]
    const result = filterByDateRange(meetings, '2026-05-01', '2026-05-31')
    expect(result).toHaveLength(1)
  })

  it('excludes meetings from 91 days ago in a 90-day range', () => {
    const now = new Date()
    const todayIso = dateToLocalIso(now)

    const ninetyOneDaysAgo = new Date(now)
    ninetyOneDaysAgo.setDate(ninetyOneDaysAgo.getDate() - 91)
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][ninetyOneDaysAgo.getDay()]
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const oldDateStr = `${dayName}, ${months[ninetyOneDaysAgo.getMonth()]} ${ninetyOneDaysAgo.getDate()}, ${ninetyOneDaysAgo.getFullYear()}`

    const ninetyDaysAgo = new Date(now)
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const fromIso = dateToLocalIso(ninetyDaysAgo)

    const meetings = [makeMeeting(oldDateStr)]
    const result = filterByDateRange(meetings, fromIso, todayIso)
    expect(result).toHaveLength(0)
  })
})
