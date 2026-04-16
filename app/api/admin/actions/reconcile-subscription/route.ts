import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json(
    {
      error: 'Subscription reconciliation is read-only during the single-user-type transition.',
    },
    { status: 410 }
  );
}
