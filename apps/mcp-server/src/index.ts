#!/usr/bin/env node

/**
 * MCP Server for work-chronicler
 *
 * Exposes work history data to AI assistants via the Model Context Protocol.
 */

import { createServer } from './server';

async function main() {
  const _server = await createServer();

  // TODO: Start the MCP server
  // This will depend on the @modelcontextprotocol/sdk API

  console.log('Work Chronicler MCP Server');
  console.log('==========================');
  console.log('');
  console.log('MCP server implementation coming soon.');
  console.log('');
  console.log('Available tools will include:');
  console.log('  - search_prs: Search PRs by date, repo, or keywords');
  console.log('  - search_tickets: Search JIRA tickets');
  console.log('  - get_linked_work: Get PR with associated tickets');
  console.log('  - list_repos: List repositories with data');
  console.log('  - get_stats: Get summary statistics');
}

main().catch(console.error);
