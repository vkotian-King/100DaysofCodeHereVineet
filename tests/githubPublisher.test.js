import test from 'node:test';
import assert from 'node:assert/strict';

import {
  base64EncodeUtf8,
  encodeContentsPath,
  classifyResponse,
  getFileSha,
  putFile,
  testConnection,
  publishAll,
  PublishError,
} from '../lib/githubPublisher.js';

function fakeResponse({ ok, status, json, headers }) {
  return {
    ok,
    status,
    headers: {
      get: (name) => (headers && headers[name.toLowerCase()]) || null,
    },
    json: async () => json,
  };
}

test('base64EncodeUtf8: round-trips non-ASCII text (emoji, accents)', () => {
  const input = 'Café ☕ 日本語 🎉';
  const encoded = base64EncodeUtf8(input);
  const decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
  assert.equal(decoded, input);
});

test('encodeContentsPath: encodes each path segment but keeps slashes', () => {
  assert.equal(encodeContentsPath('mcp updated/my note.html'), 'mcp%20updated/my%20note.html');
});

test('classifyResponse: 401 is an auth error', () => {
  const result = classifyResponse(fakeResponse({ ok: false, status: 401, headers: {} }));
  assert.equal(result.kind, 'auth');
});

test('classifyResponse: 403 with rate-limit headers is a rate_limit error', () => {
  const result = classifyResponse(fakeResponse({
    ok: false,
    status: 403,
    headers: { 'x-ratelimit-remaining': '0', 'retry-after': '60' },
  }));
  assert.equal(result.kind, 'rate_limit');
  assert.match(result.message, /60s/);
});

test('classifyResponse: other failures are generic errors', () => {
  const result = classifyResponse(fakeResponse({ ok: false, status: 500, headers: {} }));
  assert.equal(result.kind, 'error');
});

test('classifyResponse: 404 is a not_found error with an actionable message', () => {
  const result = classifyResponse(fakeResponse({ ok: false, status: 404, headers: {} }));
  assert.equal(result.kind, 'not_found');
  assert.match(result.message, /owner\/repo/);
  assert.match(result.message, /Contents: Read and write/);
});

test('getFileSha: returns null on 404 (file does not exist yet)', async () => {
  const fetchFn = async () => fakeResponse({ ok: false, status: 404, headers: {} });
  const sha = await getFileSha({ owner: 'me', repo: 'repo', path: 'index.html', pat: 'x', fetchFn });
  assert.equal(sha, null);
});

test('getFileSha: returns the sha on success', async () => {
  const fetchFn = async () => fakeResponse({ ok: true, status: 200, json: { sha: 'abc123' }, headers: {} });
  const sha = await getFileSha({ owner: 'me', repo: 'repo', path: 'index.html', pat: 'x', fetchFn });
  assert.equal(sha, 'abc123');
});

test('getFileSha: throws a PublishError on auth failure', async () => {
  const fetchFn = async () => fakeResponse({ ok: false, status: 401, headers: {} });
  await assert.rejects(
    () => getFileSha({ owner: 'me', repo: 'repo', path: 'index.html', pat: 'x', fetchFn }),
    PublishError
  );
});

test('putFile: includes sha in the body when updating, omits it when creating', async () => {
  let capturedBody;
  const fetchFn = async (_url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return fakeResponse({ ok: true, status: 200, json: {}, headers: {} });
  };

  await putFile({ owner: 'me', repo: 'repo', path: 'a.html', content: 'hi', sha: 'existing-sha', pat: 'x', fetchFn });
  assert.equal(capturedBody.sha, 'existing-sha');

  await putFile({ owner: 'me', repo: 'repo', path: 'a.html', content: 'hi', sha: null, pat: 'x', fetchFn });
  assert.equal(capturedBody.sha, undefined);
});

test('testConnection: reports ok with the login on success', async () => {
  const fetchFn = async () => fakeResponse({ ok: true, status: 200, json: { login: 'octocat' }, headers: {} });
  const result = await testConnection({ pat: 'x', fetchFn });
  assert.deepEqual(result, { ok: true, login: 'octocat' });
});

test('testConnection: reports a clear message on invalid token', async () => {
  const fetchFn = async () => fakeResponse({ ok: false, status: 401, headers: {} });
  const result = await testConnection({ pat: 'bad', fetchFn });
  assert.equal(result.ok, false);
  assert.match(result.message, /invalid or expired/);
});

test('publishAll: uploads every file in order and reports success', async () => {
  const uploaded = [];
  const fetchFn = async (url, opts) => {
    if (!opts || !opts.method) return fakeResponse({ ok: false, status: 404, headers: {} }); // sha lookup
    uploaded.push(url);
    return fakeResponse({ ok: true, status: 200, json: {}, headers: {} });
  };

  const files = [
    { path: 'style.css', content: 'body{}' },
    { path: 'a/note.html', content: '<html></html>' },
    { path: 'index.html', content: '<html></html>' },
  ];

  const results = await publishAll(files, { owner: 'me', repo: 'repo', pat: 'x', fetchFn });

  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.ok));
  assert.ok(uploaded[0].includes('style.css'));
  assert.ok(uploaded[2].includes('index.html'));
});

test('publishAll: stops after an auth failure instead of continuing to hammer the API', async () => {
  let callCount = 0;
  const fetchFn = async () => {
    callCount += 1;
    return fakeResponse({ ok: false, status: 401, headers: {} });
  };

  const files = [
    { path: 'style.css', content: 'body{}' },
    { path: 'index.html', content: '<html></html>' },
  ];

  const results = await publishAll(files, { owner: 'me', repo: 'repo', pat: 'bad', fetchFn });

  assert.equal(results.length, 1, 'should stop after the first file fails with an auth error');
  assert.equal(results[0].ok, false);
  assert.equal(callCount, 1, 'should not attempt the sha lookup for the second file');
});

test('publishAll: stops after a 404 on PUT (repo/token access issue) instead of retrying every file', async () => {
  let call = 0;
  const fetchFn = async (_url, opts) => {
    call += 1;
    if (!opts || !opts.method) return fakeResponse({ ok: false, status: 404, headers: {} }); // sha lookup: "not found" either way
    return fakeResponse({ ok: false, status: 404, headers: {} }); // PUT: repo/token access problem
  };

  const files = [
    { path: 'style.css', content: 'body{}' },
    { path: 'index.html', content: '<html></html>' },
  ];

  const results = await publishAll(files, { owner: 'me', repo: 'wrong-repo', pat: 'x', fetchFn });

  assert.equal(results.length, 1, 'should stop after the first file fails with a not_found error');
  assert.equal(results[0].ok, false);
  assert.equal(results[0].error.kind, 'not_found');
  assert.equal(call, 2, 'should not attempt the second file at all (sha lookup + PUT for the first only)');
});

test('publishAll: a generic per-file error does not stop the rest of the run', async () => {
  let call = 0;
  const fetchFn = async () => {
    call += 1;
    // First file: sha lookup 404, then PUT fails with a generic 500.
    // Second file: sha lookup 404, then PUT succeeds.
    if (call === 1) return fakeResponse({ ok: false, status: 404, headers: {} });
    if (call === 2) return fakeResponse({ ok: false, status: 500, headers: {} });
    if (call === 3) return fakeResponse({ ok: false, status: 404, headers: {} });
    return fakeResponse({ ok: true, status: 200, json: {}, headers: {} });
  };

  const files = [
    { path: 'broken.html', content: 'x' },
    { path: 'fine.html', content: 'y' },
  ];

  const results = await publishAll(files, { owner: 'me', repo: 'repo', pat: 'x', fetchFn });

  assert.equal(results.length, 2);
  assert.equal(results[0].ok, false);
  assert.equal(results[1].ok, true);
});
