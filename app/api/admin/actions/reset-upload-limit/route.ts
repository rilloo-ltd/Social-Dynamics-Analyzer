import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { resetAdminUserUploadLimit } from '@/lib/admin-dashboard';
import { recordAdminAuditLog } from '@/lib/firestore-admin';

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { userId } = await req.json();
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const result = await resetAdminUserUploadLimit(String(userId));
  await recordAdminAuditLog({ email: auth.identity.email, userId: auth.identity.uid }, 'reset_upload_limit', { userId: String(userId) });
  return NextResponse.json({ success: true, data: result });
}
