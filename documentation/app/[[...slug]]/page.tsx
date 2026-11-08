import {
  DocsPage,
  Mermaid,
  Tab,
  Tabs,
  ZoomImage,
} from '@open-agent-toolkit/docs-theme';
import defaultComponents from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { source } from '@/lib/source';

const mdxComponents = {
  ...defaultComponents,
  Mermaid,
  Tab,
  Tabs,
  img: ZoomImage,
};

type PageProps = {
  params: Promise<{ slug?: string[] }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug?.map(encodeURI));
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const page = source.getPage(params.slug?.map(encodeURI));
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <MDX components={mdxComponents} />
    </DocsPage>
  );
}

export function generateStaticParams() {
  return [
    { slug: undefined },
    // core16.10.2 loader slugs are encoded; Next static params are decoded.
    ...source
      .generateParams()
      .filter((p) => p.slug.length > 0)
      .map(({ slug }) => ({ slug: slug.map(decodeURI) })),
  ];
}
