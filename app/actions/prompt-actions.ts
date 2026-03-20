'use server';

import {
  getAllPrompts,
  getPromptData,
  savePromptDraft,
  activatePromptDraft,
  deactivatePromptDraft,
  discardPromptDraft,
  updateProductionPrompt,
} from '@/lib/firestore-admin';
import { getPromptKeys, getPrompt, PROMPT_METADATA } from '@/lib/prompts';
import { getFileFromGitHub, commitFileToGitHub, replacePromptInSource } from '@/lib/github';
import type { PromptKey } from '@/lib/prompts';

// Admin password verification
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Magav1!';

function isAdminUser(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export interface PromptInfo {
  id: string;
  name: string;
  description: string;
  production: string;
  draft: string | null;
  useDraft: boolean;
  lastModified: string | null;
  modifiedBy?: string;
}

/**
 * Get all prompts with their current status
 * Requires admin authentication
 */
export async function getPromptsAction(adminPassword: string): Promise<{ success: boolean; prompts?: PromptInfo[]; error?: string }> {
  // Verify admin
  if (!isAdminUser(adminPassword)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get all prompt IDs from the prompts file
    const promptIds = getPromptKeys();
    
    // Get Firestore data for all prompts
    const firestorePrompts = await getAllPrompts();
    
    // Combine file-based prompts with Firestore data
    const prompts: PromptInfo[] = promptIds.map((id) => {
      const filePrompt = getPrompt(id);
      const metadata = PROMPT_METADATA[id];
      const firestoreData = firestorePrompts[id];
      
      return {
        id,
        name: metadata.name,
        description: metadata.description,
        production: firestoreData?.production || filePrompt,
        draft: firestoreData?.draft || null,
        useDraft: firestoreData?.useDraft || false,
        lastModified: firestoreData?.lastModified || null,
        modifiedBy: firestoreData?.modifiedBy,
      };
    });
    
    return { success: true, prompts };
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return { success: false, error: 'Failed to fetch prompts' };
  }
}

/**
 * Save a draft version of a prompt (doesn't affect production)
 */
export async function savePromptDraftAction(
  adminPassword: string,
  promptId: string,
  draftContent: string
): Promise<{ success: boolean; error?: string }> {
  // Verify admin
  if (!isAdminUser(adminPassword)) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate prompt ID
  const validIds = getPromptKeys();
  if (!validIds.includes(promptId as PromptKey)) {
    return { success: false, error: 'Invalid prompt ID' };
  }

  // Validate content
  if (!draftContent || draftContent.trim().length === 0) {
    return { success: false, error: 'Prompt content cannot be empty' };
  }

  try {
    await savePromptDraft(promptId, draftContent, 'admin');
    return { success: true };
  } catch (error) {
    console.error('Error saving prompt draft:', error);
    return { success: false, error: 'Failed to save draft' };
  }
}

/**
 * Activate draft mode - use draft instead of production
 * This allows the admin to test the new prompt without affecting other users
 */
export async function activateDraftAction(
  adminPassword: string,
  promptId: string
): Promise<{ success: boolean; error?: string }> {
  // Verify admin
  if (!isAdminUser(adminPassword)) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate prompt ID
  const validIds = getPromptKeys();
  if (!validIds.includes(promptId as PromptKey)) {
    return { success: false, error: 'Invalid prompt ID' };
  }

  // Check if draft exists
  const promptData = await getPromptData(promptId);
  if (!promptData || !promptData.draft) {
    return { success: false, error: 'No draft exists for this prompt' };
  }

  try {
    await activatePromptDraft(promptId);
    return { success: true };
  } catch (error) {
    console.error('Error activating draft:', error);
    return { success: false, error: 'Failed to activate draft' };
  }
}

/**
 * Deactivate draft mode - revert to production prompt
 */
export async function deactivateDraftAction(
  adminPassword: string,
  promptId: string
): Promise<{ success: boolean; error?: string }> {
  // Verify admin
  if (!isAdminUser(adminPassword)) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate prompt ID
  const validIds = getPromptKeys();
  if (!validIds.includes(promptId as PromptKey)) {
    return { success: false, error: 'Invalid prompt ID' };
  }

  try {
    await deactivatePromptDraft(promptId);
    return { success: true };
  } catch (error) {
    console.error('Error deactivating draft:', error);
    return { success: false, error: 'Failed to deactivate draft' };
  }
}

/**
 * Discard draft - delete draft version and revert to production
 */
export async function discardDraftAction(
  adminPassword: string,
  promptId: string
): Promise<{ success: boolean; error?: string }> {
  // Verify admin
  if (!isAdminUser(adminPassword)) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate prompt ID
  const validIds = getPromptKeys();
  if (!validIds.includes(promptId as PromptKey)) {
    return { success: false, error: 'Invalid prompt ID' };
  }

  try {
    await discardPromptDraft(promptId);
    return { success: true };
  } catch (error) {
    console.error('Error discarding draft:', error);
    return { success: false, error: 'Failed to discard draft' };
  }
}

/**
 * Commit and deploy a prompt:
 *  1. Promote the draft to production in Firestore (immediate effect, no redeploy needed)
 *  2. Update lib/prompts.ts in GitHub so the file-based fallback stays in sync
 *     → Firebase App Hosting detects the push and auto-redeploys
 */
export async function commitPromptAction(
  adminPassword: string,
  promptId: string,
  commitMessage?: string
): Promise<{ success: boolean; error?: string; commitSha?: string; commitUrl?: string }> {
  // Verify admin
  if (!isAdminUser(adminPassword)) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate prompt ID
  const validIds = getPromptKeys();
  if (!validIds.includes(promptId as PromptKey)) {
    return { success: false, error: 'Invalid prompt ID' };
  }

  // Get the draft to promote
  const promptData = await getPromptData(promptId);
  if (!promptData || !promptData.draft) {
    return { success: false, error: 'No draft exists to commit' };
  }

  try {
    // Step 1: Promote draft → production in Firestore (users see the change immediately)
    await updateProductionPrompt(promptId, promptData.draft);

    // Step 2: Patch lib/prompts.ts in GitHub so the file stays in sync with Firestore
    const { content: currentSource, sha: currentSha } = await getFileFromGitHub('lib/prompts.ts');
    const updatedSource = replacePromptInSource(currentSource, promptId, promptData.draft);

    const msg = commitMessage || `chore: update prompt "${promptId}" via admin panel`;
    const { commitSha, commitUrl } = await commitFileToGitHub(
      'lib/prompts.ts',
      updatedSource,
      currentSha,
      msg
    );

    return { success: true, commitSha, commitUrl };
  } catch (error) {
    console.error('Error committing prompt:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to commit prompt' };
  }
}
