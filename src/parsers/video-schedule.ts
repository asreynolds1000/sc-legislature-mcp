import { safeParse } from './parser-utils.js'
import { ParserStructureError } from '../errors.js'
import type { VideoScheduleEntry } from '../types.js'

/**
 * Parse the meetings.php POST response (ROOM=ALL) for scheduled broadcasts.
 *
 * The schedule.php page loads data via AJAX from POST /meetings.php with ROOM param.
 * Each room's content is injected into a div. The response contains meeting listings
 * similar to the video archive format but for upcoming/live broadcasts.
 *
 * Note: If the legislature is not in session, this may return empty results.
 */
export function parseVideoSchedule(html: string): VideoScheduleEntry[] {
  let root
  try {
    root = safeParse(html, 'video-schedule')
  } catch (e) {
    if (e instanceof ParserStructureError && html.trim().length === 0) return []
    throw e
  }
  const entries: VideoScheduleEntry[] = []

  // The schedule response contains meeting entries with date, time, committee, and room info
  // Try to extract from table/list structures
  const links = root.querySelectorAll('a')

  for (const link of links) {
    const text = link.text.replace(/&nbsp;/g, ' ').trim()
    const onclick = link.getAttribute('onclick') || ''

    // Look for live_stream or changevideo links
    if (onclick.includes('live_stream') || onclick.includes('changevideo')) {
      // Extract chamber from live_stream call
      const streamMatch = onclick.match(/live_stream\('([SHJ])'/)
      const chamber = streamMatch ? streamMatch[1] : ''

      entries.push({
        room: '',
        committee: text,
        chamber,
        time: '',
        date: new Date().toISOString().split('T')[0],
      })
    }
  }

  return entries
}
