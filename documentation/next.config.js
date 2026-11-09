import { createDocsConfig } from '@open-agent-toolkit/docs-config';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

export default createDocsConfig({
  ...(basePath ? { basePath } : {}),
});
