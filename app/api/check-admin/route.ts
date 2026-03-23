import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req);

  if (!auth.ok) {
    const status = auth.response.status;
    if (status === 401 || status === 403) {
      return NextResponse.json({ success: true, isAdmin: false });
    }

    return auth.response;
  }

  return NextResponse.json({
    success: true,
    isAdmin: true,
    email: auth.identity.email,
  });
}
