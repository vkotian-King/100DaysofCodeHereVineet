import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMarkdown } from '../lib/transcriptFormatter.js';
import { parseVaultNote, hasUserContent } from '../lib/vaultNoteParser.js';

test('parseVaultNote: round-trips buildMarkdown output (empty sections)', () => {
  const cues = [
    { startSeconds: 0, text: 'Welcome back to the channel' },
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

  const parsed = parseVaultNote(md);

  assert.equal(parsed.title, 'A "Great" Video');
  assert.equal(parsed.channel, 'Some Channel');
  assert.equal(parsed.source, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(parsed.videoId, 'abc123');
  assert.equal(parsed.captured, '2026-08-14T00:00:00.000Z');
  assert.equal(parsed.topic, 'AI/Prompt-Engineering');
  assert.equal(parsed.sections.summary, '');
  assert.equal(parsed.sections.keyInsights, '');
  assert.deepEqual(parsed.cues, cues);
  assert.deepEqual(parsed.chapters, []);
  assert.equal(parsed.description, '');
  assert.equal(hasUserContent(parsed), false);
});

test('parseVaultNote: round-trips Chapters and Description produced by buildMarkdown', () => {
  const md = buildMarkdown({
    title: 'Video',
    channel: 'Channel',
    url: 'https://www.youtube.com/watch?v=xyz',
    videoId: 'xyz',
    captureDate: '2026-08-14T00:00:00.000Z',
    topic: 'Misc',
    cues: [{ startSeconds: 0, text: 'hello' }],
    chapters: [
      { startSeconds: 0, title: 'Intro' },
      { startSeconds: 135, title: 'Section 2' },
    ],
    description: 'Check out the repo:\nhttps://example.com/repo',
  });

  const parsed = parseVaultNote(md);

  assert.deepEqual(parsed.chapters, [
    { startSeconds: 0, title: 'Intro' },
    { startSeconds: 135, title: 'Section 2' },
  ]);
  assert.equal(parsed.description, 'Check out the repo:\nhttps://example.com/repo');
  // Chapters/description are captured facts, not authored insight — their presence
  // alone must not make hasUserContent() true.
  assert.equal(hasUserContent(parsed), false);
});

test('parseVaultNote: a plain capture (transcript-only) has no user content', () => {
  const md = buildMarkdown({
    title: 'Video',
    channel: 'Channel',
    url: 'https://www.youtube.com/watch?v=xyz',
    videoId: 'xyz',
    captureDate: '2026-08-14T00:00:00.000Z',
    topic: 'Misc',
    cues: [{ startSeconds: 0, text: 'hello' }],
  });

  const parsed = parseVaultNote(md);

  assert.equal(parsed.sections.summary, '');
  assert.equal(parsed.sections.tools, '');
  assert.equal(hasUserContent(parsed), false);
});

test('parseVaultNote: recovers sections added later by hand, and detects content', () => {
  // Sections are no longer part of the capture template — but a note can still gain
  // them later (someone editing the file, or a future on-demand analysis feature), so
  // the parser needs to keep understanding this structure whenever it's present.
  const md = [
    '---',
    'title: "Video"',
    'channel: "Channel"',
    'source: https://www.youtube.com/watch?v=xyz',
    'video_id: xyz',
    'captured: 2026-08-14T00:00:00.000Z',
    'topic: Misc',
    '---',
    '',
    '## Summary',
    '',
    'This video covers **MCP** basics.',
    '',
    '## Tools / Frameworks Mentioned',
    '',
    '- Claude',
    '- MCP SDK',
    '',
    '## Transcript',
    '',
    '- [00:00](https://www.youtube.com/watch?v=xyz&t=0s) hello',
    '',
  ].join('\n');

  const parsed = parseVaultNote(md);

  assert.equal(parsed.sections.summary, 'This video covers **MCP** basics.');
  assert.equal(parsed.sections.tools, '- Claude\n- MCP SDK');
  assert.equal(hasUserContent(parsed), true);
});

test('parseVaultNote: reconstructs a cue whose text wraps across lines', () => {
  const md = [
    '---',
    'title: "Wrapped"',
    'channel: "Ch"',
    'source: https://www.youtube.com/watch?v=w1',
    'video_id: w1',
    'captured: 2026-08-14T00:00:00.000Z',
    'topic: Test',
    '---',
    '',
    '## Summary',
    '',
    '## Key Insights',
    '',
    '## Tools / Frameworks Mentioned',
    '',
    '## Skills',
    '',
    '## Transcript',
    '',
    '- [00:04](https://www.youtube.com/watch?v=w1&t=4s) If you have ever built an app',
    'that talks to an AI model,',
    '- [00:09](https://www.youtube.com/watch?v=w1&t=9s) MCP changes everything.',
    '',
  ].join('\n');

  const parsed = parseVaultNote(md);

  assert.equal(parsed.cues.length, 2);
  assert.equal(parsed.cues[0].text, 'If you have ever built an app that talks to an AI model,');
  assert.equal(parsed.cues[0].startSeconds, 4);
  assert.equal(parsed.cues[1].text, 'MCP changes everything.');
});
