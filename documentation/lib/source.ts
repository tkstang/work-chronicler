import { createLlmsRoutes } from '@open-agent-toolkit/docs-config/llms';
import { loader } from 'fumadocs-core/source';

import { docs } from '@/.source/server';

export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
});

export const llms = createLlmsRoutes(source, {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH,
});
