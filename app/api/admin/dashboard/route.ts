import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { getAdminDashboardSnapshot } from '@/lib/admin-dashboard';

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(req.url);
  const snapshot = await getAdminDashboardSnapshot({
    preset: (searchParams.get('preset') as any) || '30d',
    startDate: searchParams.get('startDate') || undefined,
    endDate: searchParams.get('endDate') || undefined,
    tier: (searchParams.get('tier') as any) || 'all',
    analysisType: searchParams.get('analysisType') || 'all',
    analysisMode: (searchParams.get('analysisMode') as any) || 'all',
    model: searchParams.get('model') || 'all',
  });

  return NextResponse.json({ success: true, data: snapshot });
}
