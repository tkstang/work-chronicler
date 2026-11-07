import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';

// Scripted answers keyed by prompt message; repeated messages take answers in order.
const prompts = vi.hoisted(() => {
  const answers = new Map<string, unknown[]>();
  const answer = async (options: { message: string }) => {
    const queue = answers.get(options.message);
    if (!queue?.length) {
      throw new Error(`Unexpected prompt: ${options.message}`);
    }
    return queue.shift();
  };
  return { answers, answer };
});

vi.mock('@inquirer/prompts', () => ({
  input: prompts.answer,
  select: prompts.answer,
  checkbox: prompts.answer,
  confirm: prompts.answer,
  password: prompts.answer,
}));

function script(answers: Record<string, unknown[]>): void {
  prompts.answers.clear();
  for (const [message, queue] of Object.entries(answers)) {
    prompts.answers.set(message, [...queue]);
  }
}

describe('init', () => {
  let home: string;
  let workspace: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'wc-init-'));
    workspace = join(home, 'workspace');
    vi.stubEnv('HOME', home);
    vi.stubEnv('WORK_CHRONICLER_HOME', workspace);
    vi.stubEnv('WORK_CHRONICLER_PROFILE', '');
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('JIRA_TOKEN', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  });

  async function runInit(args: string[]): Promise<void> {
    const { initCommand } = await import('./index');
    await initCommand.parseAsync(args, { from: 'user' });
  }

  const readProfileFile = (profile: string, file: string) =>
    readFileSync(join(workspace, 'profiles', profile, file), 'utf-8');

  const activeProfile = () =>
    JSON.parse(readFileSync(join(workspace, 'config.json'), 'utf-8'))
      .activeProfile;

  it('creates an IC profile from the wizard answers', async () => {
    script({
      'What would you like to name this profile?': ['work'],
      'Which data sources would you like to use?': [['github']],
      'How far back should we fetch data?': ['custom'],
      'Enter start date (YYYY-MM-DD):': ['2026-01-01'],
      'Enter end date (YYYY-MM-DD) (optional, blank for now):': ['2026-06-30'],
      "What's your GitHub username?": ['@octocat'],
      'Enter a GitHub organization (or username for personal repos):': ['acme'],
      'Enter another organization (or press Enter to finish):': [''],
      "How should we find repos in 'acme'?": ['manual'],
      "Enter a repo name for 'acme':": ['acme/api'],
      'Enter another repo (or press Enter to finish):': ['web', ''],
      'Do you have your tokens ready?': [true],
      'GitHub token:': ['ghp_ic'],
      'Fetch data now? This may take a few minutes.': [false],
    });

    await runInit([]);

    const config = parseYaml(readProfileFile('work', 'config.yaml'));
    expect(config.github).toMatchObject({
      username: 'octocat',
      orgs: [{ name: 'acme', repos: ['api', 'web'] }],
    });
    expect(config.fetch).toMatchObject({
      since: '2026-01-01',
      until: '2026-06-30',
    });
    expect(config.jira).toBeUndefined();
    expect(readProfileFile('work', '.env')).toContain('GITHUB_TOKEN="ghp_ic"');
    expect(activeProfile()).toBe('work');
  });

  it('creates a manager profile and its first report from the wizard answers', async () => {
    script({
      // Manager mode is keyed on the profile name 'manager'
      'What would you like to name this profile?': ['manager'],
      'How far back should we fetch data?': ['custom'],
      'Enter start date (YYYY-MM-DD):': ['2026-01-01'],
      'Enter end date (YYYY-MM-DD) (optional, blank for now):': [''],
      'GitHub organization:': ['@acme'],
      'GitHub token:': ['ghp_mgr'],
      'Configure JIRA?': [false],
      'Add reports now?': [true],
      'Name:': ['Alice Smith'],
      'GitHub username:': ['@alice'],
      'Email:': ['alice@acme.io'],
      'Repos:': ['skip'],
      'Jira projects (comma-separated, or leave blank):': [''],
      'Add another report?': [false],
    });

    await runInit(['--mode', 'manager']);

    const config = parseYaml(readProfileFile('manager', 'config.yaml'));
    expect(config).toMatchObject({
      mode: 'manager',
      github: { org: 'acme' },
      fetch: { since: '2026-01-01', until: null },
      reports: [
        {
          name: 'Alice Smith',
          github: 'alice',
          email: 'alice@acme.io',
          repos: [],
          jiraProjects: [],
        },
      ],
    });
    expect(readProfileFile('manager', '.env')).toContain(
      'GITHUB_TOKEN="ghp_mgr"',
    );
    expect(activeProfile()).toBe('manager');
  });
});
