import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { formatToolError } from '../errors.js'
import { getMeetings, getStatusActivity, getCalendarPage, getIntroductionsPage } from '../api/legislature-client.js'
import { parseMeetings } from '../parsers/meetings.js'
import { parseStatusActivity } from '../parsers/status-activity.js'
import { parseCalendar } from '../parsers/calendar.js'
import { parseIntroductions } from '../parsers/introductions.js'
import { currentSession } from '../data/sessions.js'

export function registerMeetingTools(server: McpServer) {
  // --- get_meetings ---
  server.tool(
    'get_meetings',
    'Get upcoming SC Legislature committee meeting schedule with agendas, bills, times, and rooms. Shows current week by default.',
    {
      chamber: z.enum(['S', 'H']).optional().describe('S=Senate, H=House. Omit for both.'),
      week_offset: z.number().optional().describe('0=current week, 1=last week, 2=two weeks ago, etc.'),
    },
    async (args) => {
      try {
        const html = await getMeetings(args.chamber, args.week_offset)
        const meetings = parseMeetings(html)

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: meetings.length,
              week_offset: args.week_offset || 0,
              meetings: meetings.map((m) => ({
                date: m.date,
                time: m.time,
                committee: m.committee,
                chamber: m.chamber,
                room: m.room,
                bills_on_agenda: m.billsOnAgenda,
                agenda_url: m.agendaUrl,
              })),
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- get_status_activity ---
  server.tool(
    'get_status_activity',
    'Get SC Legislature bill status activity for a date range — "what happened this week." Shows bills that had actions (committee votes, floor votes, referrals, etc.) during the specified period.',
    {
      chamber: z.enum(['S', 'H', 'B']).optional().describe('S=Senate, H=House, B=Both. Default: B'),
      date_from: z.string().describe('Start date MM/DD/YYYY'),
      date_to: z.string().describe('End date MM/DD/YYYY'),
    },
    async (args) => {
      try {
        const session = currentSession()
        const html = await getStatusActivity(
          session,
          args.chamber || 'B',
          args.date_from,
          args.date_to,
        )
        const activities = parseStatusActivity(html)

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: activities.length,
              session,
              date_range: { from: args.date_from, to: args.date_to },
              activities,
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- get_calendar ---
  server.tool(
    'get_calendar',
    'Get the SC Legislature daily floor calendar — bills scheduled for debate on a specific date.',
    {
      chamber: z.enum(['S', 'H']).describe('S=Senate, H=House'),
      date: z.string().describe('Date YYYY-MM-DD'),
    },
    async (args) => {
      try {
        const session = currentSession()
        const html = await getCalendarPage(session, args.chamber, args.date)
        const entries = parseCalendar(html)

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: entries.length,
              chamber: args.chamber,
              date: args.date,
              entries,
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- get_new_introductions ---
  server.tool(
    'get_new_introductions',
    'Get newly filed SC Legislature bills for a specific date.',
    {
      chamber: z.enum(['S', 'H']).describe('S=Senate, H=House'),
      date: z.string().describe('Date YYYY-MM-DD'),
    },
    async (args) => {
      try {
        const session = currentSession()
        const html = await getIntroductionsPage(session, args.chamber, args.date)
        const introductions = parseIntroductions(html)

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: introductions.length,
              chamber: args.chamber,
              date: args.date,
              introductions,
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )
}
