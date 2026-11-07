import { describe, expect, it } from 'vitest';
import { ConfigSchema } from './schema';
import { ManagerConfigSchema } from '@wc-types/manager';

const baseConfig = {
  fetch: { since: '2025-01-01' },
};

describe('GitHub name normalization at the config boundary', () => {
  it('strips a leading @ and whitespace from org and user names', () => {
    const config = ConfigSchema.parse({
      ...baseConfig,
      github: {
        username: ' @octocat ',
        orgs: [{ name: '@voxmedia', repos: ['chorus'] }, { name: ' acme ' }],
      },
    });

    expect(config.github.username).toBe('octocat');
    expect(config.github.orgs.map((o) => o.name)).toEqual(['voxmedia', 'acme']);
  });

  it('strips a leading @ from the manager org and report usernames', () => {
    const config = ManagerConfigSchema.parse({
      mode: 'manager',
      github: { org: '@voxmedia' },
      fetch: { since: '2025-01-01' },
      reports: [
        { name: 'Alice', github: '@alice', email: 'alice@example.com' },
      ],
    });

    expect(config.github.org).toBe('voxmedia');
    expect(config.reports[0]?.github).toBe('alice');
  });

  it('rejects names that would still not be a valid GitHub name', () => {
    const withOrg = (name: string, username = 'octocat') =>
      ConfigSchema.safeParse({
        ...baseConfig,
        github: { username, orgs: [{ name }] },
      }).success;

    expect(withOrg('@')).toBe(false);
    expect(withOrg('@@voxmedia')).toBe(false);
    expect(withOrg('voxmedia', '@')).toBe(false);
    expect(withOrg('voxmedia', '')).toBe(false);
  });

  it('still allows an empty username when no orgs are configured', () => {
    const config = ConfigSchema.parse({
      ...baseConfig,
      github: { username: '', orgs: [] },
    });

    expect(config.github.username).toBe('');
  });
});
