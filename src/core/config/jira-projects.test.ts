import { ManagerConfigSchema } from '@wc-types/manager';
import { describe, expect, it } from 'vitest';

import { ConfigSchema } from './schema';

// Project keys go into the JQL query (`project = "<key>"`) and the work-log
// path, so a stray space or lower-case key in config must not change either.
describe('JIRA project key normalization at the config boundary', () => {
  it('trims and upper-cases IC instance project keys', () => {
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
      'OPS',
      'WEB2',
    ]);
  });

  it('trims and upper-cases manager report project keys', () => {
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

    expect(config.reports[0]?.jiraProjects).toEqual(['PROJ', 'OPS']);
  });
});
