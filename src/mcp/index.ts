#!/usr/bin/env node

/**
 * MCP Server for work-chronicler
 *
 * Exposes work history data to AI assistants via the Model Context Protocol.
 *
 * Usage:
 *   work-chronicler-mcp
 *
 * The server communicates via stdio and should be configured in your
 * AI assistant's MCP configuration (e.g., Claude Desktop, Cursor).
 */

import { createServer, startServer } from './server';

export type { MCPServerContext } from './server';
// Re-export for library usage
export { createServer, startServer } from './server';

// Run as CLI if executed directly
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('work-chronicler-mcp');

if (isMainModule) {
  createServer()
    .then(startServer)
    .catch((error) => {
      console.error('Failed to start MCP server:', error);
      process.exit(1);
    });
}
