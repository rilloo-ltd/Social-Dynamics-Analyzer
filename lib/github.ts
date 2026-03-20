import 'server-only';

const GITHUB_API = 'https://api.github.com';

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;

  if (!token || !owner || !repo) {
    throw new Error(
      'GitHub integration not configured. Set GITHUB_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME in your .env.local (and Firebase App Hosting environment).'
    );
  }

  return { token, owner, repo };
}

/**
 * Fetch a file's raw content and blob SHA from GitHub.
 */
export async function getFileFromGitHub(filePath: string): Promise<{ content: string; sha: string }> {
  const { token, owner, repo } = getGitHubConfig();

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub GET "${filePath}" failed: ${res.status} ${err.message || res.statusText}`);
  }

  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { content, sha: data.sha };
}

/**
 * Commit an updated file to GitHub.
 * Returns the new commit SHA.
 */
export async function commitFileToGitHub(
  filePath: string,
  newContent: string,
  currentSha: string,
  commitMessage: string
): Promise<{ commitSha: string; commitUrl: string }> {
  const { token, owner, repo } = getGitHubConfig();

  const encodedContent = Buffer.from(newContent, 'utf-8').toString('base64');

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: commitMessage,
      content: encodedContent,
      sha: currentSha,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub commit "${filePath}" failed: ${res.status} ${err.message || res.statusText}`);
  }

  const data = await res.json();
  const commitSha: string = data.commit.sha;
  const commitUrl = `https://github.com/${owner}/${repo}/commit/${commitSha}`;
  return { commitSha, commitUrl };
}

/**
 * Replace the value of a single prompt key inside lib/prompts.ts source.
 *
 * The file uses template literals:
 *   promptId: `...value...`,
 *
 * This function finds that template literal by key name and replaces its contents,
 * escaping any backticks or ${…} sequences in the new value so the file stays valid TypeScript.
 */
export function replacePromptInSource(source: string, promptId: string, newValue: string): string {
  const startMarker = `  ${promptId}: \``;
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`Prompt key "${promptId}" not found in prompts.ts source`);
  }

  const valueStart = startIdx + startMarker.length;

  // Walk forward to find the closing backtick, skipping backslash-escaped chars
  let i = valueStart;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2; // skip `\x`
      continue;
    }
    if (source[i] === '`') break;
    i++;
  }

  if (i >= source.length) {
    throw new Error(`No closing backtick found for prompt "${promptId}"`);
  }

  // Escape the new value so it is safe inside a JS template literal
  const escaped = newValue
    .replace(/\\/g, '\\\\')   // backslash → \\
    .replace(/`/g, '\\`')     // backtick → \`
    .replace(/\$\{/g, '\\${'); // ${ → \${

  return source.slice(0, valueStart) + escaped + source.slice(i);
}
