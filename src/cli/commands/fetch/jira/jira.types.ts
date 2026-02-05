/**
 * JIRA fetch types
 *
 * Types specific to the JIRA fetching logic.
 * Core types like JiraTicket remain in @core/types.
 */

import type { Config } from '@core/index';

/** Result of fetching tickets from a single JIRA project */
export interface JiraFetchResult {
  instance: string;
  project: string;
  ticketsWritten: number;
  ticketsSkipped: number;
  ticketsCached: number;
}

/** Options for fetching JIRA tickets */
export interface FetchJiraOptions {
  config: Config;
  outputDir: string;
  verbose?: boolean;
  useCache?: boolean;
}

/** JIRA search API response */
export interface JiraSearchResponse {
  issues: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

/** JIRA issue from API response */
export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    issuetype?: { name: string };
    status?: { name: string };
    created: string;
    resolutiondate: string | null;
    customfield_10016?: number; // Story points
    description?: string | { content: unknown[] };
  };
}
