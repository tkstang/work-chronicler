import { createRequire } from 'node:module';

import {
  type Config,
  FilteredSubsetInterruptedError,
  type FilteredSubsetState,
  findConfigPath,
  getFilteredSubsetState,
  getOutputDirectory,
  ImportInProgressError,
  loadConfig,
} from '@core/index';
import {
  getLinkedWorkTool,
  getProjectsTool,
  getStatsTool,
  getTimelineTool,
  listReposTool,
  type McpTool,
  searchDocumentsTool,
  searchMessagesTool,
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
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';

export interface MCPServerContext {
  config: Config;
  /**
   * The full work log. Each tool call decides afresh whether to read it or
   * its selected `filtered/` subset.
   */
  outputDir: string;
  server: McpServer;
}

/**
 * What the server is bound to: the full work log, never a subset. The
 * subset in use is resolved on every tool call.
 */
export interface ServerRoot {
  /** The full work log (the profile's work-log directory) */
  workLogDir: string;
  /** The configured `github.username` */
  githubUsername?: string;
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
  const workLogDir = getOutputDirectory(config, configPath ?? undefined);

  // The subset is resolved per call; this only logs the state at startup
  // (visible in debug logs)
  const startup = resolveToolContext({ workLogDir });
  if ('context' in startup && startup.context.outputDir !== workLogDir) {
    console.error(
      '[work-chronicler] Using filtered data from:',
      startup.context.outputDir,
    );
  }

  return {
    config,
    outputDir: workLogDir,
    server: createToolServer({
      workLogDir,
      githubUsername: config.github.username || undefined,
    }),
  };
}

/**
 * A fingerprint of the subset state: equal fingerprints before and after a
 * call mean the call read one consistent selection. The generation tells
 * successive subsets apart even when their markers match or they have none.
 */
function stateKey(state: FilteredSubsetState): string {
  if (state.status !== 'selected') return state.status;
  return JSON.stringify([
    state.dir,
    state.generation,
    state.selection?.createdAt ?? null,
    state.missing,
  ]);
}

/**
 * Resolve which directory a tool call reads, from the full work log: the
 * selected subset (even an empty one) when `filtered/` exists, otherwise the
 * full work log. A subset that is being replaced, was left mid-swap, or
 * cannot be read yields a result explaining that instead, so a call never
 * silently reads the full work log or an empty directory in its place.
 */
export function resolveToolContext(
  root: ServerRoot,
): { context: ToolContext; key: string } | { unavailable: CallToolResult } {
  const base = {
    fullOutputDir: root.workLogDir,
    ...(root.githubUsername ? { githubUsername: root.githubUsername } : {}),
  };
  let state: FilteredSubsetState;
  try {
    state = getFilteredSubsetState(root.workLogDir);
  } catch (error) {
    return {
      unavailable: subsetUnavailable(
        `The filtered subset cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      ),
    };
  }
  if (state.status === 'interrupted') {
    return {
      unavailable: subsetUnavailable(
        new FilteredSubsetInterruptedError(root.workLogDir, state.locked)
          .message,
      ),
    };
  }
  return {
    context: {
      ...base,
      outputDir: state.status === 'selected' ? state.dir : root.workLogDir,
    },
    key: stateKey(state),
  };
}

function subsetUnavailable(note: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error:
            'The filtered subset is unavailable, so no results are returned (the full work log is not read in its place).',
          note,
        }),
      },
    ],
  };
}

function importUnavailable(note: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error:
            'Imported records are unavailable while an import is storing a batch or needs recovery, so no results are returned (a partly stored batch is never read).',
          note,
        }),
      },
    ],
  };
}

// Report the package version to MCP clients, matching `work-chronicler --version`.
const { version: packageVersion } = createRequire(import.meta.url)(
  '../../package.json',
) as { version: string };

/**
 * Create an MCP server with every tool registered against a work log. Each
 * call reads the subset selected at that moment (see
 * {@link resolveToolContext}). Connect it to any transport.
 */
export function createToolServer(root: ServerRoot): McpServer {
  const server = new McpServer({
    name: 'work-chronicler',
    version: packageVersion,
  });

  registerTool(server, root, searchPrsTool);
  registerTool(server, root, searchTicketsTool);
  registerTool(server, root, getLinkedWorkTool);
  registerTool(server, root, listReposTool);
  registerTool(server, root, getStatsTool);
  registerTool(server, root, getProjectsTool);
  registerTool(server, root, getTimelineTool);
  registerTool(server, root, searchPrReviewsTool);
  registerTool(server, root, searchMessagesTool);
  registerTool(server, root, searchDocumentsTool);

  return server;
}

function registerTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  root: ServerRoot,
  tool: McpTool<Shape>,
): void {
  const call = async (
    input: z.output<z.ZodObject<Shape>>,
  ): Promise<CallToolResult> => {
    const resolved = resolveToolContext(root);
    if ('unavailable' in resolved) return resolved.unavailable;
    let result: CallToolResult;
    try {
      result = await tool.handler(input, resolved.context);
    } catch (error) {
      // Tools that read imported records refuse rather than read part of a
      // batch; the others are not affected
      if (error instanceof ImportInProgressError) {
        return importUnavailable(error.message);
      }
      throw error;
    }
    // A `filter` run that changed the selection during the call may have
    // left the handler reading a moving directory: report it, don't guess
    const after = resolveToolContext(root);
    if ('unavailable' in after) return after.unavailable;
    if (after.key !== resolved.key) {
      return subsetUnavailable(
        'The filtered subset changed while this call was reading it (a `work-chronicler filter` run finished). Call the tool again.',
      );
    }
    return result;
  };
  // ToolCallback<Shape> is a conditional type that TypeScript leaves
  // unresolved for a generic Shape, so no function literal is assignable to
  // it here. The handler's own signature already pins the input type.
  const callback = call as unknown as ToolCallback<Shape>;
  server.tool(tool.name, tool.description, tool.inputSchema, callback);
}

/**
 * Start the MCP server using stdio transport
 */
export async function startServer(ctx: MCPServerContext): Promise<void> {
  const transport = new StdioServerTransport();
  await ctx.server.connect(transport);
}
