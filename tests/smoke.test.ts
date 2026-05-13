import { describe, it, expect, afterAll } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerVideoTools } from '../src/tools/video.js'
import { registerMeetingTools } from '../src/tools/meetings.js'
import { registerCommitteeTools } from '../src/tools/committees.js'
import { registerMemberTools } from '../src/tools/members.js'

describe('MCP server smoke test', () => {
  const server = new McpServer({
    name: 'sc-legislature-mcp',
    version: '0.1.0',
  })

  registerVideoTools(server)
  registerMeetingTools(server)
  registerCommitteeTools(server)
  registerMemberTools(server)

  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  })

  afterAll(async () => {
    await client.close()
    await server.close()
  })

  it('registers exactly 13 tools', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ])

    const { tools } = await client.listTools()
    expect(tools).toHaveLength(13)

    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual([
      'find_legislator_by_address',
      'get_calendar',
      'get_committee_feed',
      'get_county_delegation',
      'get_hearing_video',
      'get_live_sessions',
      'get_meetings',
      'get_member_detail',
      'get_new_introductions',
      'get_status_activity',
      'get_video_schedule',
      'list_committees',
      'search_hearing_videos',
    ])
  })
})
