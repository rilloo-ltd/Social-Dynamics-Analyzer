import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { getAdminPromptStatuses } from '@/lib/admin-dashboard';

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const prompts = await getAdminPromptStatuses();
  return NextResponse.json({ success: true, data: prompts });
}
