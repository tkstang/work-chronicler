import { rmSync } from 'node:fs';

import type { ImportSubject } from '@wc-types/imported-record';
import { afterAll, describe, expect, it } from 'vitest';

import {
  makeWorld,
  messageFrontmatter,
  SECRET,
  stage,
  SYNTH_SOURCES,
} from './import.test-support';
import { type ImportSourceSettings, runImport } from './index';

// Slack privacy and opt-in rules, enforced on every record `validate` and
// `import` read. Each refusal must reject the batch without echoing the
// record's content. The synthetic record (workspace T0SYNTH01, author
// U0SYNTH01, channel C0SYNTH01, ts 1700000000.00000n) matches SYNTH_SOURCES.

const bases: string[] = [];
afterAll(() => {
  for (const base of bases) rmSync(base, { recursive: true, force: true });
});

const TS = '1700000000.000001';
const PARENT_TS = '1699999999.000100';
const LINK = 'https://synthetic.slack.com/archives/C0SYNTH01';
const ALICE: ImportSubject = { kind: 'report', reportId: 'alice-smith' };

function check(
  overrides: Record<string, unknown>,
  options: { sources?: ImportSourceSettings; target?: ImportSubject } = {},
) {
  const w = makeWorld();
  bases.push(w.base);
  const target = options.target ?? { kind: 'ic' };
  stage(
    w.staging,
    'a.md',
    messageFrontmatter(1, { subject: target, ...overrides }),
  );
  return runImport({
    mode: 'validate',
    stagingDir: w.staging,
    workLogRoot: w.workLog,
    target,
    sources: options.sources ?? SYNTH_SOURCES,
  });
}

function problems(result: ReturnType<typeof runImport>) {
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain(SECRET);
  return result.issues.map((i) => [i.code, i.field]);
}

const message = (details: Record<string, unknown>) => ({
  message: {
    ...(messageFrontmatter(1).message as Record<string, unknown>),
    ...details,
  },
});

const reply = (thread: Record<string, unknown>) =>
  message({ thread: { parentId: PARENT_TS, parentUrl: null, ...thread } });

const withChannel = (
  channel: Record<string, unknown>,
): ImportSourceSettings => ({
  slack: {
    ...(SYNTH_SOURCES.slack as NonNullable<ImportSourceSettings['slack']>),
    channels: [
      {
        id: 'C0SYNTH01',
        name: 'synthetic-channel',
        reason: 'Synthetic',
        private: false,
        ...channel,
      },
    ],
  },
});

describe('Slack records: accepted', () => {
  it('accepts a reply with permalinks to itself and its parent', () => {
    const result = check({
      url: `${LINK}/p${TS.replace('.', '')}?thread_ts=${PARENT_TS}&cid=C0SYNTH01`,
      ...reply({ parentUrl: `${LINK}/p${PARENT_TS.replace('.', '')}` }),
    });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts a report record from a channel confirmed as shared', () => {
    const result = check({}, { target: ALICE });
    expect(result.ok).toBe(true);
  });
});

describe('Slack records: opt-in and identity', () => {
  it.each([
    ['an IC', { kind: 'ic' } as ImportSubject, /this profile/],
    ['a report', ALICE, /this report/],
  ])(
    'refuses every record when Slack is not set up for %s',
    (_l, target, text) => {
      const result = check({}, { target, sources: { slack: null } });
      expect(problems(result)).toEqual([['SOURCE_RULE', 'source']]);
      expect(result.issues[0]?.message).toMatch(text);
    },
  );

  it('refuses a record from another workspace', () => {
    expect(problems(check({ sourceAccount: 'T0OTHER01' }))).toEqual([
      ['SOURCE_RULE', 'sourceAccount'],
    ]);
  });

  it('accepts a workspace configured by its URL label, and only that label', () => {
    const slack = SYNTH_SOURCES.slack as NonNullable<
      ImportSourceSettings['slack']
    >;
    const sources = { slack: { ...slack, workspace: 'example' } };

    expect(check({ sourceAccount: 'example' }, { sources }).ok).toBe(true);
    expect(problems(check({}, { sources }))).toEqual([
      ['SOURCE_RULE', 'sourceAccount'],
    ]);
    expect(
      problems(check({ sourceAccount: 'Example.slack.com' }, { sources })),
    ).toEqual([
      ['SOURCE_RULE', 'sourceAccount'],
      ['SOURCE_RULE', 'sourceAccount'],
    ]);
  });

  it('refuses a message whose author is not the configured user', () => {
    const result = check({
      attribution: { status: 'verified', authorId: 'U0OTHER01' },
    });
    expect(problems(result)).toEqual([['SOURCE_RULE', 'attribution.authorId']]);
  });

  it('refuses unverified attribution', () => {
    const result = check({
      attribution: { status: 'unverified', authorId: 'U0SYNTH01' },
    });
    expect(problems(result)).toEqual([['SOURCE_RULE', 'attribution.status']]);
  });
});

describe('Slack records: channels', () => {
  it('refuses a channel that is not configured for the subject', () => {
    const result = check({
      sourceId: `C0OTHER01/${TS}`,
      ...message({ container: { id: 'C0OTHER01', name: 'other' } }),
    });
    expect(problems(result)).toEqual([['SOURCE_RULE', 'message.container.id']]);
  });

  it('refuses a direct message even when its ID is configured', () => {
    const result = check(
      {
        sourceId: `D0SYNTH01/${TS}`,
        ...message({ container: { id: 'D0SYNTH01', name: null } }),
      },
      { sources: withChannel({ id: 'D0SYNTH01' }) },
    );
    expect(problems(result)).toEqual([['SOURCE_RULE', 'message.container.id']]);
    expect(result.issues[0]?.message).toMatch(/direct messages/);
  });

  it('refuses a report record from a channel not confirmed as shared', () => {
    const result = check(
      {},
      { target: ALICE, sources: withChannel({ sharedWithManager: false }) },
    );
    expect(problems(result)).toEqual([['SOURCE_RULE', 'message.container.id']]);
    expect(result.issues[0]?.message).toMatch(/both belong to/);
  });

  it.each([
    ['text', `see ${SECRET}`],
    ['another label', 'Bob:the-launch-will-slip'],
    ['the name in other case', 'Synthetic-Channel'],
  ])(
    'refuses a channel name that is %s, not the configured name',
    (_l, name) => {
      const result = check(message({ container: { id: 'C0SYNTH01', name } }));
      expect(problems(result)).toEqual([
        ['SOURCE_RULE', 'message.container.name'],
      ]);
    },
  );

  it('accepts the configured channel name or none', () => {
    for (const name of ['synthetic-channel', null]) {
      const result = check(message({ container: { id: 'C0SYNTH01', name } }));
      expect(result.issues).toEqual([]);
    }
  });
});

describe('Slack records: others’ content', () => {
  it.each([
    ['reply bodies', message({ replies: [{ text: SECRET }] })],
    ['a reply author list', message({ replyParticipants: ['U0OTHER01'] })],
    ['a participant list', { participants: [`U0OTHER01 ${SECRET}`] }],
    ['parent text', reply({ parentText: SECRET })],
  ])('refuses a record that carries %s', (_label, overrides) => {
    const result = check(overrides);
    expect(problems(result).map(([code]) => code)).toEqual(['SCHEMA_INVALID']);
  });

  it.each([
    [
      'a parent ID that is text',
      reply({ parentId: SECRET }),
      'message.thread.parentId',
    ],
    [
      'a parent URL with a query',
      reply({ parentUrl: `${LINK}/p1699999999000100?q=${SECRET}` }),
      'message.thread.parentUrl',
    ],
    [
      'a parent URL with a fragment',
      reply({ parentUrl: `${LINK}/p1699999999000100#${SECRET}` }),
      'message.thread.parentUrl',
    ],
    [
      'a parent URL outside Slack',
      reply({ parentUrl: `https://example.com/${SECRET}` }),
      'message.thread.parentUrl',
    ],
    [
      'a parent URL naming another message',
      reply({ parentUrl: `${LINK}/p1699999999000200` }),
      'message.thread.parentUrl',
    ],
    [
      'a message URL with a query',
      { url: `${LINK}/p1700000000000001?text=${SECRET}` },
      'url',
    ],
    [
      'a message URL naming another message',
      { url: `${LINK}/p1700000000000002` },
      'url',
    ],
  ])('refuses %s', (_label, overrides, field) => {
    expect(problems(check(overrides))).toEqual([['SOURCE_RULE', field]]);
  });

  it('refuses a thread starter that names itself as its parent', () => {
    expect(problems(check(reply({ parentId: TS })))).toEqual([
      ['SOURCE_RULE', 'message.thread'],
    ]);
  });

  it('refuses reply counts on a reply, and more repliers than replies', () => {
    expect(
      problems(
        check({
          ...reply({}),
          message: { ...reply({}).message, replyCount: 2 },
        }),
      ),
    ).toEqual([['SOURCE_RULE', 'message.replyCount']]);
    expect(
      problems(check(message({ replyCount: 1, replyParticipantCount: 2 }))),
    ).toEqual([['SOURCE_RULE', 'message.replyParticipantCount']]);
  });
});

describe('Slack records: raw markup in the body', () => {
  function checkBody(body: string) {
    const w = makeWorld();
    bases.push(w.base);
    stage(w.staging, 'a.md', messageFrontmatter(1), body);
    return runImport({
      mode: 'validate',
      stagingDir: w.staging,
      workLogRoot: w.workLog,
      target: { kind: 'ic' },
      sources: SYNTH_SOURCES,
    });
  }

  it.each([
    ['a user mention with a display name', `thanks <@U0OTHER01|${SECRET}>`],
    ['a user mention', 'thanks <@U0OTHER01> for the review'],
    ['an org user mention', `thanks <@W0OTHER01|${SECRET}>`],
    ['a channel link', `moved to <#C0OTHER01|${SECRET}>`],
    ['a special mention', '<!here> the deploy is done'],
    ['a group mention', `<!subteam^S0OTHER01|@${SECRET}> please look`],
    ['a link with a label', `see <https://example.com/x|${SECRET} words>`],
    ['a link in markup without a label', 'see <https://example.com/x>'],
    ['a mail link with a label', `ping <mailto:sam@example.com|${SECRET}>`],
    ['a phone link', 'call <tel:+15550100>'],
    ['a date', `due <!date^1767261600^{date}|${SECRET}>`],
  ])('refuses %s without echoing it', (_label, body) => {
    expect(problems(checkBody(body))).toEqual([['SOURCE_RULE', 'body']]);
  });

  it.each([
    'Shipped https://github.com/synthetic-org/api/pull/42 thanks @someone',
    'Moved to #channel, cc @here',
    '> a quote line is ordinary text',
    'if a < b and c > d, mail <me@example.com>',
    '<!-- not Slack markup -->',
    'use `<!DOCTYPE html>` at the top',
    'a `std::vector` is a <std::vector> here',
  ])('accepts a body without raw markup: %j', (body) => {
    const result = checkBody(body);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
