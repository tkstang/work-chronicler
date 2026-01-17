import {
  type Config,
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@work-chronicler/core';

export interface MCPServer {
  config: Config;
  outputDir: string;
}

/**
 * Create and configure the MCP server
 */
export async function createServer(): Promise<MCPServer> {
  const configPath = findConfigPath();
  const config = await loadConfig();
  const outputDir = getOutputDirectory(config, configPath ?? undefined);

  // TODO: Initialize MCP SDK server
  // TODO: Register tools

  return {
    config,
    outputDir,
  };
}
