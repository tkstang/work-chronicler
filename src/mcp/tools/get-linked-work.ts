import {
  buildMentionIndex,
  DIRECTORIES,
  type DocumentRecord,
  type ImportedRecordFile,
  isDocumentFile,
  isMessageFile,
  type MessageRecord,
  normalizePullRequestUrl,
  readAllImportedRecords,
  readAllPRs,
  readAllTickets,
  resolveMentions,
} from '@core/index';
import { z } from 'zod';

import {
  DOCUMENT_NOTICE,
  defineTool,
  EVIDENCE_NOTICE,
  jsonResult,
  subsetGapNote,
  truncate,
} from './types';

/** A message that mentions the looked-up PR or ticket */
function mentionSummary(record: ImportedRecordFile<MessageRecord>) {
  const fm = record.frontmatter;
  return {
    source: fm.source,
    url: fm.url,
    occurredAt: fm.occurredAt,
    attribution: fm.attribution.status,
    channel: fm.message.container.name,
    text: truncate(record.body, 300),
  };
}

/** A Google Doc that mentions the looked-up PR or ticket */
function documentSummary(record: ImportedRecordFile<DocumentRecord>) {
  const fm = record.frontmatter;
  return {
    source: fm.source,
    url: fm.url,
    title: fm.document.title,
    createdAt: fm.document.createdAt,
    modifiedAt: fm.occurredAt,
    attribution: fm.attribution.status,
    text: truncate(record.body, 300),
  };
}

/** The number in a PR URL's `/pull/<number>` segment, or null. */
function pullNumberOf(url: string): number | null {
  const match = /\/pull\/(\d+)\/?$/.exec(url);
  return match?.[1] ? Number(match[1]) : null;
}

export const getLinkedWorkTool = defineTool({
  name: 'get_linked_work',
  description:
    'Get a PR with its linked JIRA tickets, or a ticket with its linked PRs, plus imported messages and imported Google Docs that mention it (mentions are supplementary evidence, not links)',
  inputSchema: {
    prUrl: z
      .string()
      .optional()
      .describe('GitHub PR URL to look up (any form), or a bare PR number'),
    ticketKey: z.string().optional().describe('JIRA ticket key to look up'),
  },
  handler: async (input, { outputDir, fullOutputDir }) => {
    if (!input.prUrl && !input.ticketKey) {
      return jsonResult({
        error: 'Either prUrl or ticketKey must be provided',
      });
    }

    const allPRs = await readAllPRs(outputDir);
    const allTickets = await readAllTickets(outputDir);
    // Mentions resolve on read; they are reported apart from stored links
    const index = buildMentionIndex(allPRs, allTickets);
    const imported = (await readAllImportedRecords(outputDir)).map(
      (record) => ({
        record,
        mentions: resolveMentions(record.frontmatter, index),
      }),
    );
    // A subset made before messages or Docs were imported has none to list
    const gaps = [DIRECTORIES.MESSAGES, DIRECTORIES.DOCUMENTS].flatMap(
      (directory) =>
        subsetGapNote(outputDir, fullOutputDir ?? outputDir, directory) ?? [],
    );
    const mentionFields = (
      mentions: (m: ReturnType<typeof resolveMentions>) => boolean,
    ) => {
      const matches = imported
        .filter(({ mentions: m }) => mentions(m))
        .map(({ record }) => record);
      const messages = matches.filter(isMessageFile);
      const documents = matches.filter(isDocumentFile);
      const notices = [
        ...(messages.length > 0 ? [EVIDENCE_NOTICE] : []),
        ...(documents.length > 0 ? [DOCUMENT_NOTICE] : []),
      ];
      return {
        mentionedInMessages: messages.map(mentionSummary),
        mentionedInDocuments: documents.map(documentSummary),
        ...(notices.length > 0 ? { notice: notices.join(' ') } : {}),
        ...(gaps.length > 0 ? { note: gaps.join(' ') } : {}),
      };
    };

    if (input.prUrl) {
      const prUrl = input.prUrl.trim();
      // An exact URL wins. Bare digits fall back to the PR number, compared
      // against the URL's whole `/pull/<number>` segment so "23" never
      // matches PR 123.
      let matches = allPRs.filter((p) => p.frontmatter.url === prUrl);
      // The same PR written another way (case, a tab, an API URL)
      const normalized = normalizePullRequestUrl(prUrl);
      if (matches.length === 0 && normalized) {
        matches = allPRs.filter(
          (p) => normalizePullRequestUrl(p.frontmatter.url) === normalized,
        );
      }
      if (matches.length === 0 && /^\d+$/.test(prUrl)) {
        const prNumber = Number(prUrl);
        matches = allPRs.filter(
          (p) => pullNumberOf(p.frontmatter.url) === prNumber,
        );
      }

      const [pr] = matches;
      if (!pr) {
        return jsonResult({ error: 'PR not found' });
      }
      if (matches.length > 1) {
        return jsonResult({
          error: `PR number ${prUrl} matches several PRs; pass the full URL`,
          matches: matches.map((p) => p.frontmatter.url),
        });
      }

      const linkedTickets = allTickets.filter((t) =>
        pr.frontmatter.jiraTickets?.includes(t.frontmatter.key),
      );

      return jsonResult({
        pr: {
          ...pr.frontmatter,
          body: pr.body,
        },
        linkedTickets: linkedTickets.map((t) => ({
          ...t.frontmatter,
          body: t.body,
        })),
        ...mentionFields((mentions) =>
          mentions.pullRequests.some((m) => m.resolved === pr),
        ),
      });
    }

    if (input.ticketKey) {
      const ticketKey = input.ticketKey.toLowerCase();
      const ticket = allTickets.find(
        (t) => t.frontmatter.key.toLowerCase() === ticketKey,
      );

      if (!ticket) {
        return jsonResult({ error: 'Ticket not found' });
      }

      const linkedPRs = allPRs.filter((p) =>
        p.frontmatter.jiraTickets?.includes(ticket.frontmatter.key),
      );

      return jsonResult({
        ticket: {
          ...ticket.frontmatter,
          body: ticket.body,
        },
        linkedPRs: linkedPRs.map((p) => ({
          ...p.frontmatter,
          body: p.body,
        })),
        ...mentionFields((mentions) =>
          mentions.tickets.some((m) => m.resolved === ticket),
        ),
      });
    }

    return jsonResult({});
  },
});
