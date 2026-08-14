const API_ROOT = 'https://api.github.com';

class PublishError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'PublishError';
    this.kind = kind || 'error';
  }
}

// Encodes a JS string to base64 the way the GitHub Contents API expects,
// safe for non-ASCII text (emoji/accented characters show up routinely in
// captured transcripts and descriptions) — plain btoa() chokes on those.
function base64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function encodeContentsPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function authHeaders(pat) {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
  };
}

// Turns a failed Response into a typed, user-presentable classification so
// callers can decide whether to stop entirely (auth/rate-limit) or just flag
// one file as failed.
function classifyResponse(response) {
  if (response.status === 401) {
    return { kind: 'auth', message: 'GitHub token is invalid or expired. Generate a new one and try again.' };
  }

  const remaining = response.headers && response.headers.get ? response.headers.get('x-ratelimit-remaining') : null;
  const retryAfter = response.headers && response.headers.get ? response.headers.get('retry-after') : null;
  if (response.status === 403 && (remaining === '0' || retryAfter)) {
    const wait = retryAfter ? `${retryAfter}s` : 'a while';
    return { kind: 'rate_limit', message: `GitHub rate limit hit. Retry after ${wait}.` };
  }

  // GitHub deliberately returns 404 (not 403) when a token lacks access to a
  // repo, so it can't be used to confirm a private repo exists. In practice
  // this status almost always means a repo/owner typo or a token scoped to
  // the wrong repository, not a "file not found" — surface that plainly.
  if (response.status === 404) {
    return {
      kind: 'not_found',
      message: 'Repository not found, or your token doesn’t have access to it. Check the owner/repo spelling and confirm the token is scoped to this exact repository with Contents: Read and write.',
    };
  }

  return { kind: 'error', message: `GitHub API error (${response.status}).` };
}

async function getFileSha({ owner, repo, path, pat, fetchFn }) {
  const url = `${API_ROOT}/repos/${owner}/${repo}/contents/${encodeContentsPath(path)}`;
  const response = await fetchFn(url, { headers: authHeaders(pat) });

  if (response.status === 404) return null;
  if (!response.ok) {
    const { kind, message } = classifyResponse(response);
    throw new PublishError(message, kind);
  }

  const data = await response.json();
  return data.sha || null;
}

async function putFile({ owner, repo, path, content, sha, pat, fetchFn }) {
  const url = `${API_ROOT}/repos/${owner}/${repo}/contents/${encodeContentsPath(path)}`;
  const body = {
    message: `Publish ${path}`,
    content: base64EncodeUtf8(content),
  };
  if (sha) body.sha = sha;

  const response = await fetchFn(url, {
    method: 'PUT',
    headers: { ...authHeaders(pat), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const { kind, message } = classifyResponse(response);
    throw new PublishError(message, kind);
  }

  return response.json();
}

async function testConnection({ pat, fetchFn = fetch }) {
  try {
    const response = await fetchFn(`${API_ROOT}/user`, { headers: authHeaders(pat) });
    if (!response.ok) {
      const { message } = classifyResponse(response);
      return { ok: false, message };
    }
    const data = await response.json();
    return { ok: true, login: data.login };
  } catch (_err) {
    return { ok: false, message: 'Could not reach GitHub. Check your connection.' };
  }
}

// Uploads files in the given order (caller is responsible for ordering —
// style.css / note pages / topic pages first, index.html last — so a partial
// failure never leaves an already-published page linking to one that isn't
// there yet). Stops entirely on auth/rate-limit/not-found errors rather than
// continuing to hammer the API — each of those means every remaining file
// would fail identically too, so retrying per-file only adds noise. Other
// per-file errors are recorded but don't halt the run.
async function publishAll(files, { owner, repo, pat, fetchFn = fetch, onProgress = () => {} }) {
  const results = [];
  const STOP_KINDS = new Set(['auth', 'rate_limit', 'not_found']);

  for (const file of files) {
    onProgress({ path: file.path, status: 'uploading' });
    try {
      const sha = await getFileSha({ owner, repo, path: file.path, pat, fetchFn });
      await putFile({ owner, repo, path: file.path, content: file.content, sha, pat, fetchFn });
      onProgress({ path: file.path, status: 'done' });
      results.push({ path: file.path, ok: true });
    } catch (err) {
      onProgress({ path: file.path, status: 'error', error: err });
      results.push({ path: file.path, ok: false, error: err });
      if (err instanceof PublishError && STOP_KINDS.has(err.kind)) {
        break;
      }
    }
  }

  return results;
}

export {
  PublishError,
  base64EncodeUtf8,
  encodeContentsPath,
  classifyResponse,
  getFileSha,
  putFile,
  testConnection,
  publishAll,
};
