import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { formatToolError } from '../errors.js'
import { loadVideo, buildVideoUrl, buildStreamUrl, getVideoMeetingList } from '../api/legislature-client.js'
import { parseMeetingVideoList } from '../parsers/meeting-video-list.js'
import { findCommitteeFeeds, ALL_COMMITTEE_FEEDS } from '../data/committees.js'
import type { VideoMeeting } from '../types.js'

const MAX_RESULTS = 50
const DEFAULT_DAYS_BACK = 30
const MAX_DAYS_BACK = 90
const MAX_LIVE_CHECKS = 10
const VIDEO_BASE_URL = 'https://video.scstatehouse.gov'

export function dateToLocalIso(d: Date): string {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0')
}

export function filterByDateRange(meetings: VideoMeeting[], from: string, to: string): VideoMeeting[] {
  return meetings.filter((m) => {
    const parsed = new Date(m.date)
    if (isNaN(parsed.getTime())) return true
    const iso = dateToLocalIso(parsed)
    return iso >= from && iso <= to
  })
}

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
        const now = new Date()
        const defaultFrom = new Date(now)
        defaultFrom.setDate(defaultFrom.getDate() - DEFAULT_DAYS_BACK)

        const dateTo = args.date_to || dateToLocalIso(now)
        let dateFrom = args.date_from || dateToLocalIso(defaultFrom)

        // Enforce max window
        const fromDate = new Date(dateFrom + 'T00:00:00')
        const toDate = new Date(dateTo + 'T00:00:00')
        const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysDiff > MAX_DAYS_BACK) {
          const adjusted = new Date(toDate)
          adjusted.setDate(adjusted.getDate() - MAX_DAYS_BACK)
          dateFrom = dateToLocalIso(adjusted)
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
    'Get today\'s and upcoming SC Legislature session and committee hearing schedule with video links. Returns meeting keys, stream URLs, and download URLs.',
    {
      chamber: z.enum(['S', 'H']).optional().describe('S=Senate, H=House. Omit for all.'),
    },
    async (args) => {
      try {
        const html = await getVideoMeetingList(args.chamber)
        let meetings = parseMeetingVideoList(html)

        const todayIso = dateToLocalIso(new Date())
        meetings = meetings.filter((m) => {
          const d = new Date(m.date)
          if (isNaN(d.getTime())) return false
          return dateToLocalIso(d) >= todayIso
        })

        if (args.chamber) {
          meetings = meetings.filter((e) => e.chamber === args.chamber)
        }

        const entries = meetings.map((m) => {
          const reference = m.videoUrl
            ? m.videoUrl.replace(`${VIDEO_BASE_URL}/`, '')
            : ''

          return {
            key: m.key,
            date: m.date,
            chamber: m.chamber,
            committee: m.committeeName,
            duration: m.duration,
            status: dateToLocalIso(new Date(m.date)) === todayIso ? 'today' as const : 'upcoming' as const,
            ...(reference ? { stream_url: buildStreamUrl(reference) } : {}),
            ...(m.videoUrl ? { download_url: m.videoUrl } : {}),
          }
        })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: entries.length,
              as_of: todayIso,
              note: entries.length === 0
                ? 'No sessions scheduled for today or upcoming. The legislature may not be in session.'
                : undefined,
              entries,
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )

  // --- get_live_sessions ---
  server.tool(
    'get_live_sessions',
    'Get currently live-streaming SC Legislature sessions with HLS stream URLs. Checks each of today\'s sessions for active broadcast status. May take 5-10 seconds on busy session days.',
    {
      chamber: z.enum(['S', 'H', 'J']).optional().describe('S=Senate, H=House, J=Joint'),
    },
    async (args) => {
      try {
        const html = await getVideoMeetingList(args.chamber)
        let meetings = parseMeetingVideoList(html)

        const todayIso = dateToLocalIso(new Date())
        meetings = meetings.filter((m) => {
          const d = new Date(m.date)
          return !isNaN(d.getTime()) && dateToLocalIso(d) === todayIso
        })

        if (args.chamber) {
          meetings = meetings.filter((m) => m.chamber === args.chamber)
        }

        // Cap to bound latency (each loadVideo call takes ~1s due to rate limiting)
        meetings = meetings.slice(0, MAX_LIVE_CHECKS)

        const enriched = await Promise.allSettled(
          meetings.map(async (m) => {
            const result = await loadVideo(m.key, m.partNumber)
            return { meeting: m, result }
          }),
        )

        const live = enriched
          .filter((r): r is PromiseFulfilledResult<{ meeting: VideoMeeting; result: Awaited<ReturnType<typeof loadVideo>> }> =>
            r.status === 'fulfilled' && r.value.result.meetingactive,
          )
          .map((r) => {
            const { meeting, result } = r.value
            return {
              key: meeting.key,
              date: meeting.date,
              chamber: meeting.chamber,
              committee: meeting.committeeName,
              status: result.meetingstatus || 'Now Playing...',
              stream_url: buildStreamUrl(result.reference),
              video_url: buildVideoUrl(result.reference),
              title: (result.meetingtitle || '').replace(/&nbsp;/g, ' '),
              time_and_place: (result.meetingtime || '').replace(/<br\s*\/?>/g, ' — '),
            }
          })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: live.length,
              as_of: new Date().toISOString(),
              note: live.length === 0
                ? 'No active live streams found. The legislature may not be in session.'
                : undefined,
              sessions: live,
            }, null, 2),
          }],
        }
      } catch (error) {
        return formatToolError(error)
      }
    },
  )
}
