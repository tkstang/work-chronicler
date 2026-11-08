import { z } from 'zod';

/**
 * Slack settings for one subject: an IC profile (`slack:` at the top of the
 * profile config) or one report in a manager profile (`slack:` under the
 * report). The CLI never talks to Slack and never stores Slack credentials:
 * these settings say whose messages an import skill may collect, from which
 * channels, and `import` enforces them on every Slack record.
 *
 * An absent `slack:` section means Slack is not set up for that subject, and
 * `import` accepts no Slack records for it.
 */

/** A Slack workspace (team) ID, such as `T0123ABCD` (`E…` for an org) */
export const SlackWorkspaceIdSchema = z
  .string()
  .regex(
    /^[TE][A-Z0-9]{2,31}$/,
    'must be a Slack workspace ID (T… or E…, as in the workspace URL or a skill)',
  );

/** A Slack user ID, such as `U0123ABCD` (`W…` in an org) */
export const SlackUserIdSchema = z
  .string()
  .regex(/^[UW][A-Z0-9]{2,31}$/, 'must be a Slack user ID (U… or W…)');

/**
 * A Slack conversation ID as written in a channel entry. Direct messages
 * (`D…`) are never allowed; `G…` is a legacy private channel or group DM.
 */
export const SlackChannelIdSchema = z.string().superRefine((id, ctx) => {
  if (id.startsWith('D')) {
    ctx.addIssue({
      code: 'custom',
      message: 'direct messages (D… IDs) are never imported',
    });
  } else if (!/^[CG][A-Z0-9]{2,31}$/.test(id)) {
    ctx.addIssue({
      code: 'custom',
      message: 'must be a Slack channel ID (C… or G…)',
    });
  }
});

/** A channel's name without `#`: no spaces, as Slack names are */
export const SlackChannelNameSchema = z
  .string()
  .regex(
    /^[^\s#\p{C}][^\s\p{C}]{0,79}$/u,
    'must be the channel name without # (no spaces, at most 80 characters)',
  );

/** Why the channel holds review-relevant work: one line */
const ReasonSchema = z
  .string()
  .trim()
  .min(1, 'must say why the channel is included')
  .max(200)
  .regex(/^[^\p{C}]+$/u, 'must be one line of text');

const channelShape = {
  id: SlackChannelIdSchema,
  name: SlackChannelNameSchema,
  reason: ReasonSchema,
  /**
   * The explicit opt-in for a private channel. Channels are public by
   * default; a private channel is imported only when this is true.
   */
  private: z.boolean().default(false),
};

function checkChannel(
  channel: { id: string; name: string; private: boolean },
  ctx: z.RefinementCtx,
) {
  if (channel.name.startsWith('mpdm-')) {
    ctx.addIssue({
      code: 'custom',
      path: ['name'],
      message: 'group direct messages are never imported',
    });
  }
  if (channel.id.startsWith('G') && !channel.private) {
    ctx.addIssue({
      code: 'custom',
      path: ['private'],
      message:
        'a G… ID is a private conversation: set private: true to opt in (group DMs are never allowed)',
    });
  }
}

/** A channel in an IC profile */
export const SlackChannelSchema = z
  .object(channelShape)
  .superRefine(checkChannel);
export type SlackChannel = z.infer<typeof SlackChannelSchema>;

/**
 * A channel in a report's settings. `sharedWithManager` records that the
 * manager confirmed, during setup, that they and the report are both members;
 * `import` refuses report records from a channel without it.
 */
export const ReportSlackChannelSchema = z
  .object({
    ...channelShape,
    sharedWithManager: z.boolean().default(false),
  })
  .superRefine(checkChannel);
export type ReportSlackChannel = z.infer<typeof ReportSlackChannelSchema>;

function uniqueChannels(
  settings: { channels: { id: string }[] },
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  settings.channels.forEach((channel, index) => {
    if (seen.has(channel.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['channels', index, 'id'],
        message: 'channel is listed more than once',
      });
    }
    seen.add(channel.id);
  });
}

const settingsShape = {
  /** The workspace (team) ID; record `sourceAccount` must match it */
  workspace: SlackWorkspaceIdSchema,
  /** The subject's Slack user ID; record authors must match it */
  user: SlackUserIdSchema,
};

/** `slack:` in an IC profile */
export const SlackConfigSchema = z
  .object({
    ...settingsShape,
    channels: z.array(SlackChannelSchema).default([]),
  })
  .superRefine(uniqueChannels);
export type SlackConfig = z.infer<typeof SlackConfigSchema>;

/** `slack:` under a report in a manager profile */
export const ReportSlackConfigSchema = z
  .object({
    ...settingsShape,
    channels: z.array(ReportSlackChannelSchema).default([]),
  })
  .superRefine(uniqueChannels);
export type ReportSlackConfig = z.infer<typeof ReportSlackConfigSchema>;

/**
 * Resolved Slack settings for the subject an import is for (either shape).
 */
export interface SlackSettings {
  workspace: string;
  user: string;
  channels: {
    id: string;
    name: string;
    reason: string;
    private: boolean;
    sharedWithManager?: boolean;
  }[];
}
