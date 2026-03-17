import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { formatToolError } from '../errors.js'
import { loadVideo, buildVideoUrl, buildStreamUrl, getVideoMeetingList, getVideoSchedule } from '../api/legislature-client.js'
import { parseMeetingVideoList } from '../parsers/meeting-video-list.js'
import { parseVideoSchedule } from '../parsers/video-schedule.js'
import { findCommitteeFeeds, ALL_COMMITTEE_FEEDS } from '../data/committees.js'
import type { VideoMeeting } from '../types.js'

const MAX_RESULTS = 50
const DEFAULT_DAYS_BACK = 30
const MAX_DAYS_BACK = 90

export function registerVideoTools(server: McpServer) {
  // --- search_hearing_videos ---
  server.tool(
    'search_hearing_videos',
    'Search SC Legislature video archives for committee hearing and floor session recordings. Returns direct MP4 download URLs. Default: last 30 days (max 90). No other service provides these video links. Use narrow date ranges for best results.',
    {
      chamber: z.enum(['S', 'H', 'J']).optional().describe('S=Senate, H=House, J=Joint'),
      committee: z.string().optional().describe('Committee name (partial match, e.g. "judiciary", "finance")'),
      date_from: z.string().optional().describe('Start date YYYY-MM-DD (default: 30 days ago)'),
      date_to: z.string().optional().describe('End date YYYY-MM-DD (default: today)'),
      limit: z.number().optional().describe(`Max results (default/max: ${MAX_RESULTS})`),
    },
    async (args) => {
      try {
        // Enforce date window
        const now = new Date()
        const defaultFrom = new Date(now)
        defaultFrom.setDate(defaultFrom.getDate() - DEFAULT_DAYS_BACK)

        const dateTo = args.date_to || now.toISOString().split('T')[0]
        let dateFrom = args.date_from || defaultFrom.toISOString().split('T')[0]

        // Enforce max window
        const fromDate = new Date(dateFrom)
        const toDate = new Date(dateTo)
        const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysDiff > MAX_DAYS_BACK) {
          const adjusted = new Date(toDate)
          adjusted.setDate(adjusted.getDate() - MAX_DAYS_BACK)
          dateFrom = adjusted.toISOString().split('T')[0]
        }

        const html = await getVideoMeetingList(args.chamber)
        let meetings = parseMeetingVideoList(html)

        // Filter by date range
        meetings = filterByDateRange(meetings, dateFrom, dateTo)

        // Filter by committee name
        if (args.committee) {
          const q = args.committee.toLowerCase()
          meetings = meetings.filter((m) =>
            m.committeeName.toLowerCase().includes(q),
          )
        }

        // Apply limit
        const limit = Math.min(args.limit || MAX_RESULTS, MAX_RESULTS)
        const total = meetings.length
        meetings = meetings.slice(0, limit)

        const result = {
          count: meetings.length,
          total,
          date_range: { from: dateFrom, to: dateTo },
          truncated: total > limit,
          meetings: meetings.map((m) => ({
            key: m.key,
            date: m.date,
            chamber: m.chamber,
            committee: m.committeeName,
            duration: m.duration,
            video_url: m.videoUrl,
            download_urls: m.downloadUrls,
          })),
        }

        if (result.truncated) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2) +
                `\n\nShowing ${limit} of ${total} results. Narrow your date range or add a committee filter for more specific results.`,
            }],
          }
        }

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- get_hearing_video ---
  server.tool(
    'get_hearing_video',
    'Get direct MP4 video URL for a specific SC Legislature hearing or floor session. Use search_hearing_videos first to find meeting_key values.',
    {
      meeting_key: z.number().describe('Meeting key from search_hearing_videos results'),
      part: z.number().optional().describe('Part number (default: 1). Multi-hour sessions may have multiple parts.'),
    },
    async (args) => {
      try {
        const result = await loadVideo(args.meeting_key, args.part || 1)
        const videoUrl = buildVideoUrl(result.reference)
        const streamUrl = buildStreamUrl(result.reference)

        // Parse meeting info from the HTML snippet
        const meetingTitle = result.meetingtitle || ''
        const meetingTime = (result.meetingtime || '').replace(/<br\s*\/?>/g, ' — ')

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              key: result.key,
              part: result.part,
              title: meetingTitle,
              time_and_place: meetingTime,
              chamber: result.chamber,
              committee: (result.committee || '').replace(/&nbsp;/g, ' '),
              video_url: videoUrl,
              stream_url: streamUrl,
              is_live: result.meetingactive || false,
              status: result.meetingstatus || '',
              draft_quality: result.draftquality,
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- get_committee_feed ---
  server.tool(
    'get_committee_feed',
    'Get RSS/podcast feed URLs for SC Legislature committee hearing videos. Subscribe to these feeds to get notified of new recordings. No API call needed — uses static data.',
    {
      committee: z.string().optional().describe('Committee name (partial match, e.g. "judiciary"). Omit to list all feeds.'),
      chamber: z.enum(['S', 'H']).optional().describe('S=Senate, H=House'),
    },
    async (args) => {
      try {
        const feeds = findCommitteeFeeds(args.committee, args.chamber)

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: feeds.length,
              feeds: feeds.map((f) => ({
                committee: f.committeeName,
                chamber: f.chamber === 'S' ? 'Senate' : 'House',
                rss_url: f.feedUrl,
              })),
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- get_video_schedule ---
  server.tool(
    'get_video_schedule',
    'Get upcoming live broadcast schedule for SC Legislature sessions and committee hearings.',
    {
      chamber: z.enum(['S', 'H']).optional().describe('S=Senate, H=House. Omit for all.'),
    },
    async (args) => {
      try {
        const html = await getVideoSchedule()
        const entries = parseVideoSchedule(html)

        let filtered = entries
        if (args.chamber) {
          filtered = entries.filter((e) => e.chamber === args.chamber)
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: filtered.length,
              note: 'Schedule data is loaded dynamically. If empty, the legislature may not be in session or no broadcasts are scheduled.',
              entries: filtered,
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )
}

/** Filter meetings by date range (comparing the parsed date string) */
function filterByDateRange(meetings: VideoMeeting[], from: string, to: string): VideoMeeting[] {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  toDate.setHours(23, 59, 59, 999) // Include the full end date

  return meetings.filter((m) => {
    // Parse date like "Tuesday, March 17, 2026"
    const parsed = new Date(m.date)
    if (isNaN(parsed.getTime())) return true // Include if unparseable
    return parsed >= fromDate && parsed <= toDate
  })
}
