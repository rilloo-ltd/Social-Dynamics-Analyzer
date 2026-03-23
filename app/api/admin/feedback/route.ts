import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { getAdminFeedbackData } from '@/lib/admin-dashboard';

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(req.url);
  const data = await getAdminFeedbackData({
    filters: {
      preset: (searchParams.get('preset') as any) || '30d',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      tier: (searchParams.get('tier') as any) || 'all',
      analysisType: searchParams.get('analysisType') || 'all',
      analysisMode: (searchParams.get('analysisMode') as any) || 'all',
      model: 'all',
    },
    query: searchParams.get('q') || undefined,
    commentOnly: searchParams.get('commentOnly') === 'true',
    rating: searchParams.get('rating') ? Number(searchParams.get('rating')) : null,
    tier: (searchParams.get('tier') as any) || 'all',
    analysisType: searchParams.get('analysisType') || 'all',
  });

  return NextResponse.json({ success: true, data });
}
