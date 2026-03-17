import { safeParse } from './parser-utils.js'
import { ParserStructureError } from '../errors.js'
import type { VideoMeeting } from '../types.js'

/**
 * Parse the meetings.php?op=vid response into structured video meetings.
 *
 * Each meeting is in a <li> element containing:
 * - Duration in a float-right div (e.g., "0:48:01")
 * - Download link: <a href="https://video.scstatehouse.gov/mp4/...">
 * - Play link with onclick: changevideo(key, part)
 * - Date/time and committee in the link text
 */
export function parseMeetingVideoList(html: string): VideoMeeting[] {
  const root = safeParse(html, 'meeting-video-list')

  // Structure validation: meetings page should have <li> elements with changevideo
  const listItems = root.querySelectorAll('li')
  if (listItems.length === 0) {
    // Could be an empty page or a broken structure
    if (html.includes('changevideo')) {
      throw new ParserStructureError('meeting-video-list', 'Found changevideo references but no <li> elements')
    }
    // Genuinely empty — no meetings
    return []
  }

  const meetings: VideoMeeting[] = []

  for (const li of listItems) {
    const liId = li.getAttribute('id') || ''
    if (!liId.startsWith('li')) continue

    // The content td is the one with the download link and changevideo call.
    // Structure: td[0]=arrow icon, td[1]=spacer, td[2]=content with duration/links
    const tds = li.querySelectorAll('td')
    const contentTd = tds.find((td) => td.innerHTML.includes('changevideo'))
    if (!contentTd) continue

    const tdHtml = contentTd.innerHTML

    // Extract duration from float-right div (e.g., "0:48:01")
    const durationMatch = tdHtml.match(/>(\d+:\d{2}:\d{2})</)
    const duration = durationMatch ? durationMatch[1] : ''

    // Extract download URL (direct MP4 link)
    const downloadMatch = tdHtml.match(/href="(https:\/\/video\.scstatehouse\.gov\/mp4\/[^"]+)"/)
    const downloadUrl = downloadMatch ? downloadMatch[1] : ''

    // Extract key and part from changevideo(key, part)
    const changevideoMatch = tdHtml.match(/changevideo\((\d+),\s*(\d+)\)/)
    if (!changevideoMatch) continue
    const key = parseInt(changevideoMatch[1], 10)
    const part = parseInt(changevideoMatch[2], 10)

    // Extract date/time and committee from the play link text
    // Format: "Tuesday, March 17, 2026&nbsp;&nbsp;10:00 am<br>Committee -- Description"
    const playLinkMatch = tdHtml.match(/changevideo\(\d+,\s*\d+\);">([\s\S]*?)<\/a>/)
    if (!playLinkMatch) continue

    const linkText = playLinkMatch[1]
      .replace(/&nbsp;/g, ' ')
      .replace(/<br\s*\/?>/g, '\n')
      .trim()

    const lines = linkText.split('\n')
    const dateTimeLine = lines[0]?.trim() || ''
    const committeeLine = lines[1]?.trim() || ''

    // Parse date from "Tuesday, March 17, 2026  10:00 am"
    const dateMatch = dateTimeLine.match(/(\w+,\s+\w+\s+\d+,\s+\d{4})/)
    const dateStr = dateMatch ? dateMatch[1] : dateTimeLine

    // Parse committee: "Finance Committee -- Finance K-12 Education Subcommittee"
    // or "Senate -- Senate"
    const committeeName = committeeLine.replace(/\s+--\s+.*$/, '').replace(/\s+Committee$/, '').trim()

    // Determine chamber from the download URL or committee name
    let chamber: 'S' | 'H' | 'J' = 'S'
    if (downloadUrl.includes('/mp4/') && downloadUrl.match(/\/\d{8}([SHJ])/)) {
      const chamberMatch = downloadUrl.match(/\/\d{8}([SHJ])/)
      if (chamberMatch) chamber = chamberMatch[1] as 'S' | 'H' | 'J'
    } else if (committeeName.toLowerCase().includes('house')) {
      chamber = 'H'
    }

    // Count parts by looking for other <li> elements with the same key
    // For now, assume 1 part per entry (multi-part shows as separate entries)
    meetings.push({
      key,
      date: dateStr,
      chamber,
      committeeName: committeeLine,
      duration,
      partNumber: part,
      videoUrl: downloadUrl,
      downloadUrls: downloadUrl ? [downloadUrl] : [],
    })
  }

  return meetings
}
