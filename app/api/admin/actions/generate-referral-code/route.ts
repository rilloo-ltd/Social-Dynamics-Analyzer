import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { generateAdminReferralCode } from '@/lib/admin-dashboard';
import { recordAdminAuditLog } from '@/lib/firestore-admin';

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { userId, userName, code, uses } = await req.json();
  if (!userId || !userName) {
    return NextResponse.json({ error: 'Missing userId or userName' }, { status: 400 });
  }

  const generatedCode = await generateAdminReferralCode(String(userId), String(userName), code ? String(code) : undefined, uses ? Number(uses) : 3);
  await recordAdminAuditLog({ email: auth.identity.email, userId: auth.identity.uid }, 'generate_referral_code', { userId: String(userId), id: generatedCode }, {
    uses: uses ? Number(uses) : 3,
  });
  return NextResponse.json({ success: true, data: { code: generatedCode } });
}
