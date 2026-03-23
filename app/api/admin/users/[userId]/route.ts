import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { getAdminUserDetail } from '@/lib/admin-dashboard';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { userId } = await context.params;
  const detail = await getAdminUserDetail(userId);

  if (!detail) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: detail });
}
