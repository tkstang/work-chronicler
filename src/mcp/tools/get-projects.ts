import * as fs from 'node:fs/promises';

import { getAnalysisFilePath, type ProjectGrouping } from '@core/index';
import { z } from 'zod';

import { defineTool, jsonResult, PR_TICKET_COVERAGE } from './types';

export const getProjectsTool = defineTool({
  name: 'get_projects',
  description:
    'Get detected project groupings that cluster related authored PRs and tickets (PR reviews given, imported messages and imported Google Docs are not included)',
  inputSchema: {
    confidence: z
      .enum(['high', 'medium', 'low'])
      .optional()
      .describe('Filter by confidence level'),
    limit: z.number().optional().describe('Maximum number of projects'),
  },
  handler: async (input, { outputDir }) => {
    try {
      const projectsPath = getAnalysisFilePath(outputDir, 'projects');
      const projectsData = JSON.parse(await fs.readFile(projectsPath, 'utf-8'));

      let projects: ProjectGrouping[] = projectsData.projects || [];

      if (input.confidence) {
        projects = projects.filter((p) => p.confidence === input.confidence);
      }

      if (input.limit && input.limit > 0) {
        projects = projects.slice(0, input.limit);
      }

      return jsonResult({
        projects,
        total: projectsData.projects?.length || 0,
        returned: projects.length,
        summary: projectsData.summary,
        coverage: PR_TICKET_COVERAGE,
      });
    } catch {
      return jsonResult({
        error:
          'projects.json not found. Run `work-chronicler analyze --projects` first.',
      });
    }
  },
});
