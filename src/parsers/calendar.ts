import { safeParse } from './parser-utils.js'
import { ParserStructureError } from '../errors.js'
import type { CalendarEntry } from '../types.js'

/**
 * Parse a floor calendar page (e.g., /sess126_2025-2026/scal26/20260317.htm).
 *
 * Calendar pages list bills scheduled for floor debate. Structure varies but
 * typically contains bill numbers with links and brief descriptions.
 */
export function parseCalendar(html: string): CalendarEntry[] {
  let root
  try {
    root = safeParse(html, 'calendar')
  } catch (e) {
    if (e instanceof ParserStructureError) return []
    throw e
  }
  const entries: CalendarEntry[] = []
  let order = 0

  // Calendar pages typically have bill links and descriptions
  const links = root.querySelectorAll('a[href*="billsearch"]')

  for (const link of links) {
    const billNumber = link.text.trim()
    if (!billNumber) continue

    order++

    // Get surrounding text for title/description
    const parent = link.parentNode
    const contextText = parent ? parent.text.replace(/&nbsp;/g, ' ').trim() : ''

    // Extract title after bill number
    const titleMatch = contextText.match(new RegExp(billNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[-—.]?\\s*(.+)'))
    const title = titleMatch ? titleMatch[1].substring(0, 200).trim() : ''

    entries.push({
      billNumber,
      title,
      order,
    })
  }

  return entries
}
