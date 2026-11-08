import * as fs from 'node:fs/promises';

import {
  getAnalysisFilePath,
  type TimelineMonth,
  type TimelineWeek,
} from '@core/index';
import { z } from 'zod';

import { defineTool, jsonResult, TIMELINE_COVERAGE } from './types';

interface TimelineFile {
  months: TimelineMonth[];
  summary: {
    totalWeeks: number;
    totalMonths: number;
    busiestWeek?: { weekStart: string; prCount: number };
    busiestMonth?: { month: string; prCount: number };
  };
}

export const getTimelineTool = defineTool({
  name: 'get_timeline',
  description:
    'Get chronological timeline of authored PRs and tickets grouped by week or month, with imported Google Docs the subject owns listed apart by modified time (PR reviews given and imported messages are not included)',
  inputSchema: {
    granularity: z
      .enum(['week', 'month'])
      .optional()
      .describe('Time grouping (default: week)'),
    since: z.string().optional().describe('Start date (ISO format)'),
    until: z.string().optional().describe('End date (ISO format)'),
    limit: z.number().optional().describe('Maximum number of periods'),
  },
  handler: async (input, { outputDir }) => {
    try {
      const timelinePath = getAnalysisFilePath(outputDir, 'timeline');
      const timelineData = JSON.parse(
        await fs.readFile(timelinePath, 'utf-8'),
      ) as TimelineFile;

      const granularity = input.granularity || 'week';

      let periods: (TimelineWeek | TimelineMonth)[];
      let totalCount: number;

      if (granularity === 'week') {
        periods = timelineData.months.flatMap((m) => m.weeks);
        totalCount = timelineData.summary.totalWeeks;
      } else {
        periods = timelineData.months;
        totalCount = timelineData.summary.totalMonths;
      }

      // Compare period starts as strings: weeks carry weekStart (YYYY-MM-DD),
      // months carry month (YYYY-MM).
      if (input.since || input.until) {
        periods = periods.filter((p) => {
          const periodStart = 'weekStart' in p ? p.weekStart : `${p.month}-01`;
          if (input.since && periodStart < input.since) return false;
          if (input.until && periodStart > input.until) return false;
          return true;
        });
      }

      if (input.limit && input.limit > 0) {
        periods = periods.slice(0, input.limit);
      }

      return jsonResult({
        granularity,
        periods,
        total: totalCount,
        returned: periods.length,
        summary: timelineData.summary,
        coverage: TIMELINE_COVERAGE,
      });
    } catch {
      return jsonResult({
        error:
          'timeline.json not found. Run `work-chronicler analyze --timeline` first.',
      });
    }
  },
});
