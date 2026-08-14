import test from 'node:test';
import assert from 'node:assert/strict';

import { formatTimestamp, buildMarkdown } from '../lib/transcriptFormatter.js';

test('formatTimestamp: boundary values', () => {
  assert.equal(formatTimestamp(0), '00:00');
  assert.equal(formatTimestamp(59), '00:59');
  assert.equal(formatTimestamp(60), '01:00');
  assert.equal(formatTimestamp(3599), '59:59');
  assert.equal(formatTimestamp(3600), '1:00:00');
  assert.equal(formatTimestamp(3661), '1:01:01');
});

test('buildMarkdown: front matter fields and fixed heading order', () => {
  const cues = [
    { startSeconds: 0, text: 'Welcome back to the channel' },
    { startSeconds: 4, text: "Today we're covering prompt engineering" },
    { startSeconds: 65, text: 'and a bit of tooling.' },
  ];

  const md = buildMarkdown({
    title: 'A "Great" Video',
    channel: 'Some Channel',
    url: 'https://www.youtube.com/watch?v=abc123',
    videoId: 'abc123',
    captureDate: '2026-08-14T00:00:00.000Z',
    topic: 'AI/Prompt-Engineering',
    cues,
  });

  assert.match(md, /^---\n/);
  assert.match(md, /title: "A \\"Great\\" Video"/);
  assert.match(md, /channel: "Some Channel"/);
  assert.match(md, /source: https:\/\/www\.youtube\.com\/watch\?v=abc123/);
  assert.match(md, /video_id: abc123/);
  assert.match(md, /topic: AI\/Prompt-Engineering/);

  const headingOrder = ['## Summary', '## Key Insights', '## Tools / Frameworks Mentioned', '## Skills', '## Transcript'];
  let lastIndex = -1;
  for (const heading of headingOrder) {
    const idx = md.indexOf(heading);
    assert.ok(idx > lastIndex, `${heading} should appear after the previous heading`);
    lastIndex = idx;
  }

  assert.match(md, /- \[00:00\]\(https:\/\/www\.youtube\.com\/watch\?v=abc123&t=0s\) Welcome back to the channel/);
  assert.match(md, /- \[01:05\]\(https:\/\/www\.youtube\.com\/watch\?v=abc123&t=65s\) and a bit of tooling\./);
});

test('buildMarkdown: handles empty cues list without crashing', () => {
  const md = buildMarkdown({
    title: 'Empty',
    channel: 'Channel',
    url: 'https://www.youtube.com/watch?v=xyz',
    videoId: 'xyz',
    captureDate: '2026-08-14T00:00:00.000Z',
    topic: 'Misc',
    cues: [],
  });

  assert.match(md, /## Transcript\n\n$/);
});
