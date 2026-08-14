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

test('buildMarkdown: front matter fields and transcript-only body', () => {
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

  // No Summary/Key Insights/Tools/Skills placeholders — the capture stays a plain
  // transcript; any elaboration is added later, separately, when actually wanted.
  assert.ok(!md.includes('## Summary'));
  assert.ok(!md.includes('## Key Insights'));
  assert.ok(!md.includes('## Tools / Frameworks Mentioned'));
  assert.ok(!md.includes('## Skills'));
  assert.match(md, /## Transcript/);

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

test('buildMarkdown: omits Chapters/Description sections when absent', () => {
  const md = buildMarkdown({
    title: 'No extras',
    channel: 'Channel',
    url: 'https://www.youtube.com/watch?v=xyz',
    videoId: 'xyz',
    captureDate: '2026-08-14T00:00:00.000Z',
    topic: 'Misc',
    cues: [],
  });

  assert.ok(!md.includes('## Chapters'));
  assert.ok(!md.includes('## Description'));
});

test('buildMarkdown: includes a Chapters section with timestamp links, before Transcript', () => {
  const md = buildMarkdown({
    title: 'Chaptered',
    channel: 'Channel',
    url: 'https://www.youtube.com/watch?v=xyz',
    videoId: 'xyz',
    captureDate: '2026-08-14T00:00:00.000Z',
    topic: 'Misc',
    cues: [],
    chapters: [
      { startSeconds: 0, title: 'Intro' },
      { startSeconds: 135, title: 'Section 2' },
    ],
  });

  assert.match(md, /## Chapters\n\n- \[00:00\]\(https:\/\/www\.youtube\.com\/watch\?v=xyz&t=0s\) Intro\n- \[02:15\]\(https:\/\/www\.youtube\.com\/watch\?v=xyz&t=135s\) Section 2/);
  assert.ok(md.indexOf('## Chapters') < md.indexOf('## Transcript'));
});

test('buildMarkdown: wraps Description in a fenced code block, before Transcript', () => {
  const md = buildMarkdown({
    title: 'Described',
    channel: 'Channel',
    url: 'https://www.youtube.com/watch?v=xyz',
    videoId: 'xyz',
    captureDate: '2026-08-14T00:00:00.000Z',
    topic: 'Misc',
    cues: [],
    description: 'Check out the repo:\nhttps://example.com/repo',
  });

  assert.match(md, /## Description\n\n```\nCheck out the repo:\nhttps:\/\/example\.com\/repo\n```\n/);
  assert.ok(md.indexOf('## Description') < md.indexOf('## Transcript'));
});
