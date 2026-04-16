import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json(
    {
      error: 'Tier updates are disabled. All users now share the same rolling quota.',
    },
    { status: 410 }
  );
}
