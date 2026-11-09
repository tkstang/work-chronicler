import { llms } from '@/lib/source';

export const dynamic = 'force-static';

export function GET() {
  return llms.index();
}
