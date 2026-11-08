import { llms } from '@/lib/source';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return llms.generateStaticParams();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  return llms.page((await params).slug);
}
