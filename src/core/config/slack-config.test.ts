import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigUpdateError, MAX_CONFIG_BYTES } from '@config/config-file';
import { ConfigSchema } from '@config/schema';
import { nodeImportFs } from '@core/import/import-fs';
import {
  crashingFs,
  fsError,
  hookedFs,
  storeRecord,
} from '@core/import/import.test-support';
import { IMPORT_TRANSACTION_DIRECTORY, nodeReaderFs } from '@core/index';
import { ManagerConfigSchema } from '@wc-types/manager';
import { loadManagerConfig, updateReport } from '@workspace/report-manager';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

import {
  type SlackChannelInput,
  type SlackSettingsChange,
  type SlackSettingsOwner,
  updateSlackSettings,
} from './slack-config';

// Slack settings live in the user's config file, next to settings this
// command does not own. Every change must keep the rest of the file (comments
// included), and a refused or failed change must leave the file exactly as
// it was. All IDs are synthetic.

const IC_YAML = `# My profile (keep this comment)
github:
  username: synthetic-ic # inline comment
  orgs: []
output:
  directory: ./work-log
fetch:
  since: "2026-01-01"
custom:
  unknownSetting: keep-me
`;

const MANAGER_YAML = `mode: manager
github:
  org: synthetic-org
fetch:
  since: "2026-01-01"
reports:
  - name: Alice Smith
    github: alice-synthetic
    email: alice@example.com
    note: unknown report key # kept
  - name: Bob Jones
    github: bob-synthetic
    email: bob@example.com
`;

const IC: SlackSettingsOwner = { kind: 'ic' };
const ALICE: SlackSettingsOwner = { kind: 'report', reportId: 'alice-smith' };
const CONFIGURE: SlackSettingsChange = {
  kind: 'configure',
  workspace: 'T0TEST0001',
  user: 'U0TEST0001',
};

function channel(
  overrides: Partial<SlackChannelInput> = {},
): SlackChannelInput {
  return {
    id: 'C0TEST0001',
    name: 'synthetic-eng',
    reason: 'Design discussions',
    private: false,
    ...overrides,
  };
}

let root: string;
let configPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wc-slack-config-'));
  configPath = join(root, 'config.yaml');
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function write(text: string) {
  writeFileSync(configPath, text);
}
function read() {
  return readFileSync(configPath, 'utf-8');
}
function change(
  owner: SlackSettingsOwner,
  slackChange: SlackSettingsChange,
  fs = nodeImportFs,
) {
  return updateSlackSettings({ configPath, owner, change: slackChange, fs });
}
function leftovers() {
  return readdirSync(root).filter((name) => name !== 'config.yaml');
}

describe('Slack config schema', () => {
  const base = parse(IC_YAML) as Record<string, unknown>;
  const withChannels = (channels: unknown[]) => ({
    ...base,
    slack: { workspace: 'T0TEST0001', user: 'U0TEST0001', channels },
  });

  it('loads a profile without Slack settings (Slack stays off)', () => {
    const parsed = ConfigSchema.parse(base);
    expect(parsed.slack).toBeUndefined();
  });

  it('defaults a channel to public', () => {
    const parsed = ConfigSchema.parse(
      withChannels([{ id: 'C0TEST0001', name: 'synthetic-eng', reason: 'x' }]),
    );
    expect(parsed.slack?.channels[0]?.private).toBe(false);
  });

  it.each([
    ['a direct message', { id: 'D0TEST0001', name: 'dm', reason: 'x' }],
    [
      'a group direct message',
      { id: 'C0TEST0001', name: 'mpdm-a--b-1', reason: 'x', private: true },
    ],
    [
      'a G… conversation without the private opt-in',
      { id: 'G0TEST0001', name: 'synthetic-private', reason: 'x' },
    ],
    [
      'a channel without a reason',
      { id: 'C0TEST0001', name: 'eng', reason: ' ' },
    ],
  ])('refuses %s', (_label, entry) => {
    expect(ConfigSchema.safeParse(withChannels([entry])).success).toBe(false);
  });

  it.each(['T0TEST0001', 'E0TEST0001', 'example', 'ex-ample-2', 'a'])(
    'accepts the workspace %s (a team ID or a URL label)',
    (workspace) => {
      const config = {
        ...withChannels([]),
        slack: { ...withChannels([]).slack, workspace },
      };
      expect(ConfigSchema.safeParse(config).success).toBe(true);
    },
  );

  it.each([
    'Example',
    '-example',
    'example-',
    'example.slack.com',
    'https://example.slack.com',
    'x0test0001 ',
    '',
    'a'.repeat(64),
  ])('refuses the workspace %j', (workspace) => {
    const config = {
      ...withChannels([]),
      slack: { ...withChannels([]).slack, workspace },
    };
    expect(ConfigSchema.safeParse(config).success).toBe(false);
  });

  it('refuses a channel listed twice', () => {
    const entry = { id: 'C0TEST0001', name: 'synthetic-eng', reason: 'x' };
    expect(ConfigSchema.safeParse(withChannels([entry, entry])).success).toBe(
      false,
    );
  });
});

describe('updateSlackSettings: IC profile', () => {
  it('adds Slack settings and keeps every other setting and comment', () => {
    write(IC_YAML);

    expect(change(IC, CONFIGURE).changed).toBe(true);
    expect(
      change(IC, { kind: 'add-channel', channel: channel() }).changed,
    ).toBe(true);

    const text = read();
    expect(text).toContain('# My profile (keep this comment)');
    expect(text).toContain('# inline comment');
    const value = parse(text) as Record<string, unknown>;
    const { slack, ...rest } = value;
    expect(rest).toEqual(parse(IC_YAML));
    expect(slack).toEqual({
      workspace: 'T0TEST0001',
      user: 'U0TEST0001',
      channels: [
        {
          id: 'C0TEST0001',
          name: 'synthetic-eng',
          reason: 'Design discussions',
          private: false,
        },
      ],
    });
    expect(leftovers()).toEqual([]);
  });

  it('configures a workspace by its URL label, and refuses a host name', () => {
    write(IC_YAML);

    expect(
      change(IC, {
        kind: 'configure',
        workspace: 'example',
        user: 'U0TEST0001',
      }).changed,
    ).toBe(true);
    expect(parse(read()).slack.workspace).toBe('example');
    const before = read();
    expect(() =>
      change(IC, {
        kind: 'configure',
        workspace: 'example.slack.com',
        user: 'U0TEST0001',
      }),
    ).toThrow(/workspace URL label/);
    expect(read()).toBe(before);
  });

  it('leaves the file untouched when the change is already there', () => {
    write(IC_YAML);
    change(IC, CONFIGURE);
    change(IC, { kind: 'add-channel', channel: channel() });
    const before = read();
    const mtime = statSync(configPath).mtimeMs;

    expect(change(IC, CONFIGURE).changed).toBe(false);
    expect(
      change(IC, { kind: 'add-channel', channel: channel() }).changed,
    ).toBe(false);
    expect(read()).toBe(before);
    expect(statSync(configPath).mtimeMs).toBe(mtime);
  });

  it('removes only the named channel and refuses an ID that is not configured', () => {
    write(IC_YAML);
    change(IC, CONFIGURE);
    change(IC, { kind: 'add-channel', channel: channel() });
    change(IC, {
      kind: 'add-channel',
      channel: channel({ id: 'C0TEST0002', name: 'synthetic-ops' }),
    });

    expect(
      change(IC, { kind: 'remove-channel', id: 'C0TEST0001' }).changed,
    ).toBe(true);
    const before = read();
    expect(() =>
      change(IC, { kind: 'remove-channel', id: 'C0TEST0001' }),
    ).toThrow(
      'Channel C0TEST0001 is not configured for this profile (configured channels: C0TEST0002)',
    );
    expect(read()).toBe(before);
    const slack = (parse(read()) as { slack: { channels: { id: string }[] } })
      .slack;
    expect(slack.channels.map((c) => c.id)).toEqual(['C0TEST0002']);
  });

  it('says so when no channels are configured and an ID is removed', () => {
    write(IC_YAML);
    change(IC, CONFIGURE);

    expect(() =>
      change(IC, { kind: 'remove-channel', id: 'C0TEST0001' }),
    ).toThrow(/no channels are configured/);
  });

  it.each([
    ['a direct message', channel({ id: 'D0TEST0001' })],
    ['a G… conversation without --private', channel({ id: 'G0TEST0001' })],
    ['a group DM', channel({ name: 'mpdm-x--y-1' })],
    [
      'a shared-membership confirmation (reports only)',
      channel({ sharedWithManager: true }),
    ],
  ])('refuses %s and writes nothing', (_label, refused) => {
    write(IC_YAML);
    change(IC, CONFIGURE);
    const before = read();

    expect(() => change(IC, { kind: 'add-channel', channel: refused })).toThrow(
      ConfigUpdateError,
    );
    expect(read()).toBe(before);
  });

  it('accepts a private channel only with the opt-in', () => {
    write(IC_YAML);
    change(IC, CONFIGURE);

    change(IC, {
      kind: 'add-channel',
      channel: channel({ id: 'G0TEST0001', private: true }),
    });
    const slack = (parse(read()) as { slack: { channels: unknown[] } }).slack;
    expect(slack.channels).toEqual([
      expect.objectContaining({ id: 'G0TEST0001', private: true }),
    ]);
  });

  it('refuses channels before Slack is configured', () => {
    write(IC_YAML);
    expect(() =>
      change(IC, { kind: 'add-channel', channel: channel() }),
    ).toThrow(/slack configure/);
    expect(read()).toBe(IC_YAML);
  });

  it('refuses to change workspace or user while channels are configured', () => {
    write(IC_YAML);
    change(IC, CONFIGURE);
    change(IC, { kind: 'add-channel', channel: channel() });
    const before = read();

    expect(() =>
      change(IC, { ...CONFIGURE, user: 'U0TEST0002' } as SlackSettingsChange),
    ).toThrow(/Remove them first/);
    expect(read()).toBe(before);
  });

  describe('a user change with Slack messages already imported', () => {
    // storeRecord's messages are by U0SYNTH01
    const workLog = () => join(root, 'work-log');
    const configureUser = (user: string, readFs?: typeof nodeReaderFs) =>
      updateSlackSettings({
        configPath,
        owner: IC,
        change: { kind: 'configure', workspace: 'T0SYNTH01', user },
        workLog: workLog(),
        readFs,
      });

    it('refuses another user, naming the messages to remove', () => {
      write(IC_YAML);
      storeRecord(workLog(), 1);

      expect(() => configureUser('U0TEST0002')).toThrow(
        /1 Slack message\(s\) by another Slack user \(U0SYNTH01\).*remove .*messages\/slack/,
      );
      expect(read()).toBe(IC_YAML);
    });

    it('refuses a user change after the channels were removed', () => {
      write(IC_YAML);
      configureUser('U0SYNTH01');
      change(IC, { kind: 'add-channel', channel: channel() });
      change(IC, { kind: 'remove-channel', id: 'C0TEST0001' });
      storeRecord(workLog(), 1);
      const before = read();

      expect(() => configureUser('U0TEST0002')).toThrow(/another Slack user/);
      expect(read()).toBe(before);
    });

    it("accepts the messages' own user, and any user once they are removed", () => {
      write(IC_YAML);
      storeRecord(workLog(), 1);

      expect(configureUser('U0SYNTH01').changed).toBe(true);
      rmSync(join(workLog(), 'messages'), { recursive: true });
      expect(configureUser('U0TEST0002').changed).toBe(true);
      expect(parse(read())).toMatchObject({ slack: { user: 'U0TEST0002' } });
    });

    it('refuses when the messages cannot be checked', () => {
      write(IC_YAML);
      storeRecord(workLog(), 1);
      mkdirSync(join(workLog(), IMPORT_TRANSACTION_DIRECTORY));

      expect(() => configureUser('U0TEST0002')).toThrow(/could not be checked/);
      expect(read()).toBe(IC_YAML);
    });

    it('refuses when a message directory cannot be read', () => {
      write(IC_YAML);
      storeRecord(workLog(), 1);
      const readFs = {
        ...nodeReaderFs,
        readdir: (path: string) => {
          if (path.endsWith(join('messages', 'slack'))) throw fsError('EIO');
          return nodeReaderFs.readdir(path);
        },
      };

      expect(() => configureUser('U0TEST0002', readFs)).toThrow(
        /could not be checked/,
      );
      expect(read()).toBe(IC_YAML);
    });
  });

  it('refuses a channel that is configured with other settings', () => {
    write(IC_YAML);
    change(IC, CONFIGURE);
    change(IC, { kind: 'add-channel', channel: channel() });
    const before = read();

    expect(() =>
      change(IC, {
        kind: 'add-channel',
        channel: channel({ reason: 'Another reason' }),
      }),
    ).toThrow(/already configured/);
    expect(read()).toBe(before);
  });
});

describe('updateSlackSettings: manager reports', () => {
  it("changes only the named report's settings", () => {
    write(MANAGER_YAML);

    change(ALICE, CONFIGURE);
    change(ALICE, {
      kind: 'add-channel',
      channel: channel({ sharedWithManager: true }),
    });

    const text = read();
    expect(text).toContain('# kept');
    const value = parse(text) as { reports: Record<string, unknown>[] };
    const { slack, ...alice } = value.reports[0] as Record<string, unknown>;
    const original = parse(MANAGER_YAML) as { reports: unknown[] };
    expect({ ...value, reports: [alice, value.reports[1]] }).toEqual(original);
    expect(slack).toEqual({
      workspace: 'T0TEST0001',
      user: 'U0TEST0001',
      channels: [
        {
          id: 'C0TEST0001',
          name: 'synthetic-eng',
          reason: 'Design discussions',
          private: false,
          sharedWithManager: true,
        },
      ],
    });
    expect(
      ManagerConfigSchema.parse(value).reports[0]?.slack?.channels,
    ).toHaveLength(1);
  });

  it('refuses a report channel without the shared-membership confirmation', () => {
    write(MANAGER_YAML);
    change(ALICE, CONFIGURE);
    const before = read();

    expect(() =>
      change(ALICE, { kind: 'add-channel', channel: channel() }),
    ).toThrow(/both belong to/);
    expect(read()).toBe(before);
  });

  it('refuses channels for a report without Slack settings', () => {
    write(MANAGER_YAML);
    expect(() =>
      change(ALICE, {
        kind: 'add-channel',
        channel: channel({ sharedWithManager: true }),
      }),
    ).toThrow(/not set up for report alice-smith/);
    expect(read()).toBe(MANAGER_YAML);
  });

  it('refuses a report that is not in the profile', () => {
    write(MANAGER_YAML);
    expect(() =>
      change({ kind: 'report', reportId: 'carol-jones' }, CONFIGURE),
    ).toThrow(/No report with ID carol-jones/);
    expect(read()).toBe(MANAGER_YAML);
  });

  it('keeps report Slack settings when `reports update` rewrites the config', () => {
    vi.stubEnv('HOME', join(root, 'home'));
    vi.stubEnv('WORK_CHRONICLER_HOME', root);
    const profileConfig = join(root, 'profiles', 'team', 'config.yaml');
    mkdirSync(join(root, 'profiles', 'team'), { recursive: true });
    writeFileSync(profileConfig, MANAGER_YAML);
    updateSlackSettings({
      configPath: profileConfig,
      owner: ALICE,
      change: CONFIGURE,
    });
    updateSlackSettings({
      configPath: profileConfig,
      owner: ALICE,
      change: {
        kind: 'add-channel',
        channel: channel({ sharedWithManager: true }),
      },
    });

    updateReport('team', 'alice-smith', { addRepo: 'synthetic-repo' });

    expect(loadManagerConfig('team').reports[0]?.slack).toEqual({
      workspace: 'T0TEST0001',
      user: 'U0TEST0001',
      channels: [
        expect.objectContaining({ id: 'C0TEST0001', sharedWithManager: true }),
      ],
    });
  });
});

describe('updateSlackSettings: the file is replaced whole or not at all', () => {
  it('keeps the file permissions', () => {
    write(IC_YAML);
    chmodSync(configPath, 0o600);

    change(IC, CONFIGURE);

    expect(statSync(configPath).mode & 0o777).toBe(0o600);
  });

  it('keeps permissions the process umask would narrow', () => {
    write(IC_YAML);
    chmodSync(configPath, 0o640);
    const umask = process.umask(0o077);
    try {
      change(IC, CONFIGURE);
    } finally {
      process.umask(umask);
    }

    expect(statSync(configPath).mode & 0o777).toBe(0o640);
  });

  it('refuses a change that would make the config too large to edit again', () => {
    // A long comment brings the file to just under the limit
    const padding = `# ${'x'.repeat(MAX_CONFIG_BYTES - IC_YAML.length - 40)}\n`;
    write(`${IC_YAML}${padding}`);
    const before = read();
    expect(Buffer.byteLength(before)).toBeLessThanOrEqual(MAX_CONFIG_BYTES);

    expect(() => change(IC, CONFIGURE)).toThrow(/larger than/);
    expect(read()).toBe(before);
    expect(leftovers()).toEqual([]);
  });

  it('refuses a config that is a symbolic link, leaving the target alone', () => {
    const target = join(root, 'real.yaml');
    writeFileSync(target, IC_YAML);
    symlinkSync(target, configPath);

    expect(() => change(IC, CONFIGURE)).toThrow(/symbolic link/);
    expect(readFileSync(target, 'utf-8')).toBe(IC_YAML);
  });

  it('refuses a config with another hard link, leaving both names alone', () => {
    write(IC_YAML);
    const other = join(root, 'other.yaml');
    linkSync(configPath, other);

    expect(() => change(IC, CONFIGURE)).toThrow(/hard links/);
    expect(read()).toBe(IC_YAML);
    expect(statSync(configPath).ino).toBe(statSync(other).ino);
    rmSync(other);
  });

  it('refuses when the filesystem reports more than one link', () => {
    write(IC_YAML);
    const fs = {
      ...nodeImportFs,
      lstat: (path: string) => ({ ...nodeImportFs.lstat(path), nlink: 2 }),
    };

    expect(() => change(IC, CONFIGURE, fs)).toThrow(/hard links/);
    expect(read()).toBe(IC_YAML);
    expect(leftovers()).toEqual([]);
  });

  it.each([
    ['invalid YAML', 'github: [unclosed\n'],
    ['an invalid config', 'github:\n  username: synthetic-ic\n'],
    ['two YAML documents', `${IC_YAML}---\nother: doc\n`],
  ])('refuses %s', (_label, text) => {
    write(text);
    expect(() => change(IC, CONFIGURE)).toThrow(ConfigUpdateError);
    expect(read()).toBe(text);
  });

  it('refuses when the config changes while it is being updated', () => {
    write(IC_YAML);
    const concurrent = `${IC_YAML}# changed by someone else\n`;
    let changed = false;
    const fs = hookedFs(nodeImportFs, (op) => {
      if (op === 'writeFile' && !changed) {
        changed = true;
        writeFileSync(configPath, concurrent);
      }
    });

    expect(() => change(IC, CONFIGURE, fs)).toThrow(/changed while/);
    expect(read()).toBe(concurrent);
    expect(leftovers()).toEqual([]);
  });

  it.each(['writeFile', 'rename'] as const)(
    'keeps the original when %s fails',
    (failing) => {
      write(IC_YAML);
      const fs = hookedFs(nodeImportFs, (op) => {
        if (op === failing) throw fsError('EIO');
      });

      expect(() => change(IC, CONFIGURE, fs)).toThrow(/EIO/);
      expect(read()).toBe(IC_YAML);
      expect(leftovers()).toEqual([]);
    },
  );

  it.each([1, 2])(
    'keeps the original after a crash at write %i (before the rename)',
    (crashAt) => {
      write(IC_YAML);

      expect(() =>
        change(IC, CONFIGURE, crashingFs(nodeImportFs, crashAt)),
      ).toThrow();
      const text = read();
      expect(text).toBe(IC_YAML);
      expect(ConfigSchema.safeParse(parse(text)).success).toBe(true);
    },
  );

  it('reports a failed directory flush as a warning after the change', () => {
    write(IC_YAML);
    const fs = hookedFs(nodeImportFs, (op) => {
      if (op === 'syncDirectory') throw fsError('EIO');
    });

    const result = change(IC, CONFIGURE, fs);
    expect(result.changed).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining('power failure')]);
    expect(parse(read())).toMatchObject({ slack: { user: 'U0TEST0001' } });
  });
});

describe('updateSlackSettings: a hand-formatted config', () => {
  // Not in the yaml library's own layout: aligned comments, an unindented
  // sequence and flow mappings. Re-serializing would change these bytes.
  const HAND_YAML = `github:
  username: synthetic-ic   # aligned
  orgs: []
fetch:
  since: "2026-01-01"      # aligned
slack:
  workspace: T0TEST0001    # workspace (team) ID
  user: U0TEST0001         # my user ID
  channels:
  - {id: C0TEST0001, name: synthetic-eng, reason: Design discussions}
`;

  it.each([
    ['configuring the same workspace and user', CONFIGURE],
    [
      'adding a channel exactly as configured',
      { kind: 'add-channel', channel: channel() } as SlackSettingsChange,
    ],
  ])('leaves the bytes alone for %s', (_label, noOp) => {
    write(HAND_YAML);

    expect(change(IC, noOp)).toEqual({ changed: false, warnings: [] });
    expect(read()).toBe(HAND_YAML);
  });

  it('refuses to remove a mistyped channel ID, naming the configured one', () => {
    write(HAND_YAML);

    expect(() =>
      change(IC, { kind: 'remove-channel', id: 'C0TEST000X' }),
    ).toThrow(/C0TEST000X is not configured .*configured channels: C0TEST0001/);
    expect(read()).toBe(HAND_YAML);
  });

  it('still makes a real change, keeping the comments', () => {
    write(HAND_YAML);

    expect(
      change(IC, { kind: 'remove-channel', id: 'C0TEST0001' }).changed,
    ).toBe(true);
    expect(read()).toContain('# my user ID');
    expect(parse(read())).toMatchObject({ slack: { channels: [] } });
  });
});
