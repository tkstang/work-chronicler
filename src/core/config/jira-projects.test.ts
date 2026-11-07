import { ManagerConfigSchema } from '@wc-types/manager';
import { describe, expect, it } from 'vitest';

import { ConfigSchema } from './schema';

// Project keys go into the JQL query (`project = "<key>"`) and the work-log
// path, so a stray space in config must not change either. Case is kept so an
// existing lower-case project directory stays where it is.
describe('JIRA project key normalization at the config boundary', () => {
  it('trims IC instance project keys without changing their case', () => {
    const config = ConfigSchema.parse({
      github: { username: '', orgs: [] },
      fetch: { since: '2025-01-01' },
      jira: {
        instances: [
          {
            name: 'acme',
            url: 'https://acme.atlassian.net',
            projects: [' PROJ ', 'ops', 'Web2'],
          },
        ],
      },
    });

    expect(config.jira?.instances[0]?.projects).toEqual([
      'PROJ',
      'ops',
      'Web2',
    ]);
  });

  it('trims manager report project keys without changing their case', () => {
    const config = ManagerConfigSchema.parse({
      mode: 'manager',
      github: { org: 'acme' },
      fetch: { since: '2025-01-01' },
      reports: [
        {
          name: 'Alice',
          github: 'alice',
          email: 'alice@example.com',
          jiraProjects: [' proj', 'OPS '],
        },
      ],
    });

    expect(config.reports[0]?.jiraProjects).toEqual(['proj', 'OPS']);
  });
});
