#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerVideoTools } from './tools/video.js'
import { registerMeetingTools } from './tools/meetings.js'
import { registerCommitteeTools } from './tools/committees.js'
import { registerMemberTools } from './tools/members.js'

const server = new McpServer({
  name: 'sc-legislature-mcp',
  version: '0.1.0',
})

// Video archive tools (scstatehouse.gov/video/)
registerVideoTools(server)

// Schedule & Activity tools
registerMeetingTools(server)

// Committee & Member tools
registerCommitteeTools(server)
registerMemberTools(server)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
