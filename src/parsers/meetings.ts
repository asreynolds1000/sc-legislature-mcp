import { parse } from 'node-html-parser'
import { rejectIfCloudflare } from './parser-utils.js'
import type { Meeting } from '../types.js'

/**
 * Parse the meetings.php response for committee meeting schedule.
 *
 * Structure: <li> elements with:
 * - Date header: <span style="font-weight:bold; text-decoration:underline;">Monday, March 16, 2026</span>
 * - Time + room + committee in <li> text: "10:00 am -- Gressette Room 407 -- Committee Name"
 * - Agenda links: <a href="/agendas/126s16194.pdf">
 * - Bill links: <a href="/billsearch.php?billnumbers=532&session=126...">532</a>
 */
export function parseMeetings(html: string): Meeting[] {
  rejectIfCloudflare(html)

  const root = parse(html)
  const meetings: Meeting[] = []
  let currentDate = ''

  // Find all list items in the main content
  const listItems = root.querySelectorAll('li')

  for (const li of listItems) {
    const liHtml = li.innerHTML

    // Check for date header (underlined bold span)
    const dateSpan = li.parentNode?.querySelector('span[style*="text-decoration:underline"]')
    if (dateSpan) {
      const dateText = dateSpan.text.trim()
      if (dateText.match(/\w+,\s+\w+\s+\d+,\s+\d{4}/)) {
        currentDate = dateText
      }
    }

    // Meeting entries have "time -- room -- committee" pattern
    const meetingMatch = liHtml.match(/<span[^>]*font-weight:\s*bold[^>]*>([^<]+)<\/span>\s*--\s*([^-]+)\s*--\s*/)
    if (!meetingMatch) continue

    const time = meetingMatch[1].trim()
    const room = meetingMatch[2].trim()

    // Extract committee name — everything after the second "--" up to the first <br> or <div>
    const afterRoom = liHtml.substring(liHtml.indexOf(meetingMatch[0]) + meetingMatch[0].length)
    const committeeMatch = afterRoom.match(/^([^<]+)/)
    const committeeName = committeeMatch
      ? committeeMatch[1].replace(/&nbsp;/g, ' ').trim()
      : ''

    // Extract bill numbers from billsearch links
    const billMatches = liHtml.matchAll(/billnumbers=(\d+)/g)
    const bills = [...billMatches].map((m) => m[1])

    // Extract agenda URL
    const agendaMatch = liHtml.match(/href="(\/agendas\/[^"]+)"/)
    const agendaUrl = agendaMatch ? `https://www.scstatehouse.gov${agendaMatch[1]}` : undefined

    // Determine chamber from agenda URL pattern (s=Senate, h=House, j=Joint)
    let chamber: 'S' | 'H' | 'J' = 'S'
    if (agendaMatch) {
      const chamberCode = agendaMatch[1].match(/\d{3}([shj])/)
      if (chamberCode) {
        chamber = chamberCode[1].toUpperCase() as 'S' | 'H' | 'J'
      }
    }

    meetings.push({
      date: currentDate,
      time,
      committee: committeeName,
      chamber,
      room,
      billsOnAgenda: bills,
      agendaUrl,
    })
  }

  return meetings
}
