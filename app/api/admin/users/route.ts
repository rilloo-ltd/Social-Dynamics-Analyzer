import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { getAdminUsers } from '@/lib/admin-dashboard';

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(req.url);
  const users = await getAdminUsers({
    query: searchParams.get('q') || undefined,
    tier: (searchParams.get('tier') as any) || 'all',
    subscriptionStatus: searchParams.get('subscriptionStatus') || 'all',
  });

  return NextResponse.json({ success: true, data: users });
}
