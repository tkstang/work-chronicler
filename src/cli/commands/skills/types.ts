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

export const AI_TOOL_KEYS = Object.keys(AI_TOOLS) as AIToolKey[];

export const InstallMethodSchema = z.enum(['copy', 'symlink']);
export type InstallMethod = z.infer<typeof InstallMethodSchema>;

/**
 * Skill name prefix to avoid conflicts
 */
export const SKILL_PREFIX = 'work-chronicler-';

/**
 * Package skills that were renamed, old name → new name.
 *
 * `skills install` migrates each old entry on every selected tool once its
 * replacement is installed and verified. Keep pairs here for as long as
 * users may upgrade from a release that shipped the old name.
 */
export const RENAMED_SKILLS: Readonly<Record<string, string>> = {
  'work-chronicler-generate-resume-bullets':
    'work-chronicler-write-resume-bullets',
  'work-chronicler-mgmt-write-peer-review': 'work-chronicler-write-peer-review',
  'work-chronicler-mgmt-write-review-packet':
    'work-chronicler-manager-write-review-packet',
  'work-chronicler-mgmt-quarterly-highlights':
    'work-chronicler-manager-write-quarterly-highlights',
  'work-chronicler-mgmt-team-summary':
    'work-chronicler-manager-write-team-summary',
};
