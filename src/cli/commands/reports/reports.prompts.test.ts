import type { ManagerConfig } from '@wc-types/manager';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { promptForReport } from './reports.prompts';

const answers = vi.hoisted(() => new Map<string, unknown>());

vi.mock('@inquirer/prompts', () => {
  const answer = async (options: { message: string }) => {
    if (!answers.has(options.message)) {
      throw new Error(`Unexpected prompt: ${options.message}`);
    }
    return answers.get(options.message);
  };
  return { input: answer, select: answer };
});

const config: ManagerConfig = {
  mode: 'manager',
  github: { org: 'acme' },
  fetch: { since: '2026-01-01', until: null },
  reports: [],
};

describe('promptForReport', () => {
  beforeEach(() => {
    answers.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('normalizes the GitHub name and splits comma-separated repos and projects', async () => {
    answers.set('Name:', 'Alice Smith');
    answers.set('GitHub username:', ' @alice ');
    answers.set('Email:', 'alice@acme.io');
    answers.set('Repos:', 'manual');
    answers.set('Repos (comma-separated):', ' api, web ,, ');
    answers.set(
      'Jira projects (comma-separated, or leave blank):',
      'PROJ, OPS',
    );

    await expect(promptForReport(config)).resolves.toEqual({
      name: 'Alice Smith',
      github: 'alice',
      email: 'alice@acme.io',
      repos: ['api', 'web'],
      jiraProjects: ['PROJ', 'OPS'],
    });
  });
});
