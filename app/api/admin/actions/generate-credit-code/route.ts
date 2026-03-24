import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { generateAdminCreditCode } from '@/lib/admin-dashboard';
import { recordAdminAuditLog } from '@/lib/firestore-admin';

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await req.json().catch(() => ({}));
  const credits = Number(body?.credits) || 2;

  const code = await generateAdminCreditCode(credits);
  await recordAdminAuditLog(
    { email: auth.identity.email, userId: auth.identity.uid },
    'generate_credit_code',
    { id: code },
    { credits },
  );
  return NextResponse.json({ success: true, data: { code } });
}
