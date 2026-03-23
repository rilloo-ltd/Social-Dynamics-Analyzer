import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { updateAdminUserTier } from '@/lib/admin-dashboard';
import { recordAdminAuditLog } from '@/lib/firestore-admin';

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { userId, tier } = await req.json();
  if (!userId || !tier) {
    return NextResponse.json({ error: 'Missing userId or tier' }, { status: 400 });
  }

  const result = await updateAdminUserTier(String(userId), tier);
  await recordAdminAuditLog({ email: auth.identity.email, userId: auth.identity.uid }, 'update_user_tier', { userId: String(userId) }, { tier });
  return NextResponse.json({ success: true, data: result });
}
