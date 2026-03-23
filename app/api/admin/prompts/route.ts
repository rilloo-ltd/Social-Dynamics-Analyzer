import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import {
  activateAdminPromptDraft,
  commitAdminPrompt,
  deactivateAdminPromptDraft,
  discardAdminPromptDraft,
  getAdminPromptDetails,
  saveAdminPromptDraft,
} from '@/lib/admin-dashboard';
import { recordAdminAuditLog } from '@/lib/firestore-admin';

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  const prompts = await getAdminPromptDetails();
  return NextResponse.json({ success: true, data: prompts });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const action = String(body.action || '');
    const promptId = String(body.promptId || '');

    if (!action || !promptId) {
      return NextResponse.json({ error: 'Missing action or promptId' }, { status: 400 });
    }

    if (action === 'saveDraft') {
      await saveAdminPromptDraft(promptId, String(body.draftContent || ''), auth.identity.email);
      await recordAdminAuditLog({ email: auth.identity.email, userId: auth.identity.uid }, 'prompt_save_draft', { id: promptId });
      return NextResponse.json({ success: true });
    }

    if (action === 'activateDraft') {
      await activateAdminPromptDraft(promptId);
      await recordAdminAuditLog({ email: auth.identity.email, userId: auth.identity.uid }, 'prompt_activate_draft', { id: promptId });
      return NextResponse.json({ success: true });
    }

    if (action === 'deactivateDraft') {
      await deactivateAdminPromptDraft(promptId);
      await recordAdminAuditLog({ email: auth.identity.email, userId: auth.identity.uid }, 'prompt_deactivate_draft', { id: promptId });
      return NextResponse.json({ success: true });
    }

    if (action === 'discardDraft') {
      await discardAdminPromptDraft(promptId);
      await recordAdminAuditLog({ email: auth.identity.email, userId: auth.identity.uid }, 'prompt_discard_draft', { id: promptId });
      return NextResponse.json({ success: true });
    }

    if (action === 'commit') {
      const result = await commitAdminPrompt(promptId, body.commitMessage ? String(body.commitMessage) : undefined);
      await recordAdminAuditLog({ email: auth.identity.email, userId: auth.identity.uid }, 'prompt_commit', { id: promptId }, {
        commitSha: result.commitSha,
        commitUrl: result.commitUrl,
      });
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ error: 'Unsupported prompt action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Prompt action failed' },
      { status: 500 }
    );
  }
}
