import type { CommitteeFeed } from '../types.js'

/**
 * Static committee data for RSS/podcast feeds.
 * Committee IDs are stable across sessions. Update when committees are added/removed.
 * Source: video.scstatehouse.gov/feeds/ (verified 2026-03-17)
 */

export const SENATE_COMMITTEES: CommitteeFeed[] = [
  { committeeId: '2000000375', committeeName: 'Agriculture and Natural Resources', chamber: 'S', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000375.xml' },
  { committeeId: '2000000450', committeeName: 'Banking and Insurance', chamber: 'S', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000450.xml' },
  { committeeId: '2000000500', committeeName: 'Corrections and Penology', chamber: 'S', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000500.xml' },
  { committeeId: '2000000525', committeeName: 'Education', chamber: 'S', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000525.xml' },
  { committeeId: '2000000575', committeeName: 'Ethics', chamber: 'S', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000575.xml' },
  { committeeId: '2000000625', committeeName: 'Finance', chamber: 'S', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000625.xml' },
  { committeeId: '2000000650', committeeName: 'Fish, Game and Forestry', chamber: 'S', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000650.xml' },
  { committeeId: '2000000675', committeeName: 'General', chamber: 'S', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000675.xml' },
  { committeeId: '2000000800', committeeName: 'Judiciary', chamber: 'S', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000800.xml' },
  { committeeId: '2000000825', committeeName: 'Labor, Commerce and Industry', chamber: 'S', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000825.xml' },
  { committeeId: '2000000900', committeeName: 'Medical Affairs', chamber: 'S', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000900.xml' },
]

export const HOUSE_COMMITTEES: CommitteeFeed[] = [
  { committeeId: '2000000050', committeeName: 'Agriculture, Natural Resources and Environmental Affairs', chamber: 'H', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000050.xml' },
  { committeeId: '2000000100', committeeName: 'Education and Public Works', chamber: 'H', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000100.xml' },
  { committeeId: '2000000125', committeeName: 'Ethics', chamber: 'H', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000125.xml' },
  { committeeId: '2000000200', committeeName: 'Judiciary', chamber: 'H', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000200.xml' },
  { committeeId: '2000000225', committeeName: 'Labor, Commerce and Industry', chamber: 'H', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000225.xml' },
  { committeeId: '2000000235', committeeName: 'Legislative Oversight', chamber: 'H', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000235.xml' },
  { committeeId: '2000000250', committeeName: 'Medical, Military, Public and Municipal Affairs', chamber: 'H', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000250.xml' },
  { committeeId: '2000000285', committeeName: 'Regulations and Administrative Procedures', chamber: 'H', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000285.xml' },
  { committeeId: '2000000325', committeeName: 'Ways and Means', chamber: 'H', feedUrl: 'https://video.scstatehouse.gov/feeds/videoarchive_2000000325.xml' },
]

export const ALL_COMMITTEE_FEEDS = [...SENATE_COMMITTEES, ...HOUSE_COMMITTEES]

/** Find committee feeds by name (case-insensitive, partial match) */
export function findCommitteeFeeds(query?: string, chamber?: 'S' | 'H'): CommitteeFeed[] {
  let feeds = ALL_COMMITTEE_FEEDS

  if (chamber) {
    feeds = feeds.filter((f) => f.chamber === chamber)
  }

  if (query) {
    const q = query.toLowerCase()
    feeds = feeds.filter((f) => f.committeeName.toLowerCase().includes(q))
  }

  return feeds
}
