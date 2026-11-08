import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';

/**
 * Everything a tool handler needs, resolved once at server startup.
 */
export interface ToolContext {
  /** Work-log directory the tools read (`filtered/` when it has data). */
  outputDir: string;
  /**
   * The full work log when `outputDir` is its `filtered/` subset. Lets a
   * tool notice a subset that is missing data the full work log has.
   */
  fullOutputDir?: string;
  /**
   * The configured `github.username`. Review records written for anyone
   * else are not this user's work and are left out.
   */
  githubUsername?: string;
}

/**
 * One MCP tool: its client-facing contract plus a handler that runs without
 * a transport.
 */
export interface McpTool<Shape extends z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: Shape;
  handler: (
    input: z.output<z.ZodObject<Shape>>,
    context: ToolContext,
  ) => Promise<CallToolResult>;
}

/**
 * Define a tool with its input type inferred from the schema.
 */
export function defineTool<Shape extends z.ZodRawShape>(
  tool: McpTool<Shape>,
): McpTool<Shape> {
  return tool;
}

/**
 * Wrap raw text as a tool result.
 */
export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

/**
 * Serialize a value as a compact JSON tool result.
 */
export function jsonResult(value: unknown): CallToolResult {
  return textResult(JSON.stringify(value));
}

/**
 * Validate and parse a date string. Returns the Date if valid, throws if invalid.
 */
export function parseAndValidateDate(dateStr: string, fieldName: string): Date {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Invalid ${fieldName} date format: "${dateStr}". Use ISO format (YYYY-MM-DD).`,
    );
  }
  return date;
}
