import { Command } from 'commander';

export const mcpCommand = new Command('mcp')
  .description('Start the MCP server for AI assistant integration')
  .option('--info', 'Show MCP configuration info without starting server')
  .action(async (options: { info?: boolean }) => {
    if (options.info) {
      console.log('Work Chronicler MCP Server');
      console.log('==========================\n');
      console.log(
        'The MCP server exposes your work history to AI assistants like',
      );
      console.log(
        'Claude Desktop and Cursor via the Model Context Protocol.\n',
      );
      console.log('Available tools:');
      console.log('  - search_prs: Search PRs by date, repo, keywords, impact');
      console.log('  - search_tickets: Search JIRA tickets by project, status');
      console.log('  - get_linked_work: Get a PR with its linked tickets');
      console.log('  - list_repos: List repositories with statistics');
      console.log('  - get_stats: Get summary statistics');
      console.log('  - get_projects: Get detected project groupings');
      console.log('  - get_timeline: Get chronological timeline of work\n');
      console.log('Configuration:');
      console.log(
        '  Claude Desktop: Add to ~/Library/Application Support/Claude/claude_desktop_config.json',
      );
      console.log('  Cursor: Add to .cursor/mcp.json\n');
      console.log('Example config:');
      console.log('  {');
      console.log('    "mcpServers": {');
      console.log('      "work-chronicler": {');
      console.log('        "command": "npx",');
      console.log('        "args": ["work-chronicler", "mcp"]');
      console.log('      }');
      console.log('    }');
      console.log('  }');
      return;
    }

    // Import the MCP server dynamically to avoid loading it when not needed
    try {
      const { createServer, startServer } = await import('@mcp/server');
      const ctx = await createServer();
      await startServer(ctx);
    } catch (error) {
      console.error('Failed to start MCP server:', error);
      process.exit(1);
    }
  });
