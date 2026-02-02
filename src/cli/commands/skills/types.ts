import { z } from 'zod';

/**
 * Supported AI tools for skill installation
 */
export const AI_TOOLS = {
  claude: {
    name: 'Claude Code',
    configDir: '.claude',
    skillsDir: 'skills',
  },
  cursor: {
    name: 'Cursor',
    configDir: '.cursor',
    skillsDir: 'skills',
  },
  codex: {
    name: 'Codex',
    configDir: '.codex',
    skillsDir: 'skills',
  },
  gemini: {
    name: 'Gemini',
    configDir: '.gemini',
    skillsDir: 'skills',
  },
} as const;

export type AIToolKey = keyof typeof AI_TOOLS;

export const InstallMethodSchema = z.enum(['copy', 'symlink']);
export type InstallMethod = z.infer<typeof InstallMethodSchema>;

/**
 * Skill name prefix to avoid conflicts
 */
export const SKILL_PREFIX = 'work-chronicler-';
