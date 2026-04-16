import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json(
    {
      error: 'Upload-limit resets are disabled. Capacity returns automatically on a rolling 24-hour window.',
    },
    { status: 410 }
  );
}
