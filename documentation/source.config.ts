import { createSourceConfig } from '@open-agent-toolkit/docs-config';
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

const sourceConfig = createSourceConfig({
  oatConfigFile: './../.oat/config.json',
  appRoot: '.',
});

export const docs = defineDocs({
  dir: sourceConfig.contentDir,
  docs: sourceConfig.docs,
  meta: sourceConfig.meta,
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: sourceConfig.remarkPlugins,
  },
});
