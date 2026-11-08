import {
  type Config,
  findConfigPath,
  getEffectiveOutputDir,
  getOutputDirectory,
  loadConfig,
} from '@core/index';
import {
  getLinkedWorkTool,
  getProjectsTool,
  getStatsTool,
  getTimelineTool,
  listReposTool,
  type McpTool,
  searchPrReviewsTool,
  searchPrsTool,
  searchTicketsTool,
  type ToolContext,
} from '@mcp/tools/index';
import {
  McpServer,
  type ToolCallback,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { z } from 'zod';

export interface MCPServerContext {
  config: Config;
  outputDir: string;
  server: McpServer;
}

/**
 * Create and configure the MCP server with all tools
 *
 * Config discovery order:
 * 1. WORK_CHRONICLER_CONFIG environment variable (path to config file)
 * 2. WORK_CHRONICLER_DIR environment variable (directory containing config)
 * 3. Portable workspace active profile config (if workspace root exists)
 *    - WORK_CHRONICLER_HOME overrides the workspace root (default: ~/.work-chronicler)
 *    - WORK_CHRONICLER_PROFILE overrides the active profile
 * 4. Current working directory
 * 5. ~/.config/work-chronicler/
 */
export async function createServer(): Promise<MCPServerContext> {
  // Support explicit config path via environment variable
  const envConfigPath = process.env.WORK_CHRONICLER_CONFIG;
  const envConfigDir = process.env.WORK_CHRONICLER_DIR;

  let explicitPath: string | undefined;
  if (envConfigPath) {
    explicitPath = envConfigPath;
  } else if (envConfigDir) {
    // If directory specified, look for config files in it
    explicitPath = `${envConfigDir}/work-chronicler.yaml`;
  }

  const configPath = findConfigPath(explicitPath);
  const config = await loadConfig(explicitPath);
  const baseOutputDir = getOutputDirectory(config, configPath ?? undefined);

  // Check if filtered data exists and use it by default
  const { dir: outputDir, isFiltered } = getEffectiveOutputDir(baseOutputDir);

  // Log which directory we're using (visible in debug logs)
  if (isFiltered) {
    console.error('[work-chronicler] Using filtered data from:', outputDir);
  }

  return {
    config,
    outputDir,
    server: createToolServer({ outputDir, fullOutputDir: baseOutputDir }),
  };
}

/**
 * Create an MCP server with every tool registered against a resolved
 * work-log directory. Connect it to any transport.
 */
export function createToolServer(context: ToolContext): McpServer {
  const server = new McpServer({
    name: 'work-chronicler',
    version: '0.1.0',
  });

  registerTool(server, context, searchPrsTool);
  registerTool(server, context, searchTicketsTool);
  registerTool(server, context, getLinkedWorkTool);
  registerTool(server, context, listReposTool);
  registerTool(server, context, getStatsTool);
  registerTool(server, context, getProjectsTool);
  registerTool(server, context, getTimelineTool);
  registerTool(server, context, searchPrReviewsTool);

  return server;
}

function registerTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  context: ToolContext,
  tool: McpTool<Shape>,
): void {
  // ToolCallback<Shape> is a conditional type that TypeScript leaves
  // unresolved for a generic Shape, so no function literal is assignable to
  // it here. The handler's own signature already pins the input type.
  const callback = ((input: z.output<z.ZodObject<Shape>>) =>
    tool.handler(input, context)) as unknown as ToolCallback<Shape>;
  server.tool(tool.name, tool.description, tool.inputSchema, callback);
}

/**
 * Start the MCP server using stdio transport
 */
export async function startServer(ctx: MCPServerContext): Promise<void> {
  const transport = new StdioServerTransport();
  await ctx.server.connect(transport);
}
