import test from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeHtml,
  slugifyForUrl,
  renderInlineMarkdown,
  renderUserSection,
  sortTopicsWithPinned,
  sortNotesByRecency,
  buildNotePage,
  buildTopicPage,
  buildIndexPage,
  buildSiteFiles,
} from '../lib/siteGenerator.js';
import { buildMarkdown } from '../lib/transcriptFormatter.js';

test('escapeHtml: escapes all five special characters', () => {
  assert.equal(escapeHtml(`<a> & "b" 'c'`), '&lt;a&gt; &amp; &quot;b&quot; &#39;c&#39;');
});

test('slugifyForUrl: lowercases, replaces non-alphanumerics, trims dashes', () => {
  assert.equal(slugifyForUrl('MCP vs API: Why?'), 'mcp-vs-api-why');
  assert.equal(slugifyForUrl(''), 'untitled');
  assert.equal(slugifyForUrl('   '), 'untitled');
});

test('renderInlineMarkdown: supports bold, italic, and links', () => {
  assert.equal(renderInlineMarkdown('**bold**'), '<strong>bold</strong>');
  assert.equal(renderInlineMarkdown('*italic*'), '<em>italic</em>');
  assert.equal(renderInlineMarkdown('_italic_'), '<em>italic</em>');
  assert.equal(
    renderInlineMarkdown(escapeHtml('[Claude](https://claude.com)')),
    '<a href="https://claude.com" target="_blank" rel="noopener">Claude</a>'
  );
});

test('renderInlineMarkdown: unsupported syntax passes through as literal text', () => {
  assert.equal(renderInlineMarkdown(escapeHtml('`code span`')), '`code span`');
  assert.equal(renderInlineMarkdown(escapeHtml('### heading')), '### heading');
  assert.equal(renderInlineMarkdown(escapeHtml('1. numbered item')), '1. numbered item');
});

test('renderUserSection: groups a flat unordered list', () => {
  const html = renderUserSection('- Claude\n- MCP SDK');
  assert.equal(html, '<ul><li>Claude</li><li>MCP SDK</li></ul>');
});

test('renderUserSection: blank-line-separated blocks become separate paragraphs', () => {
  const html = renderUserSection('First paragraph.\n\nSecond paragraph with **bold**.');
  assert.equal(html, '<p>First paragraph.</p>\n<p>Second paragraph with <strong>bold</strong>.</p>');
});

test('renderUserSection: numbered lists and headings render as literal paragraph text, not structure', () => {
  const html = renderUserSection('1. First\n2. Second');
  assert.ok(!html.includes('<ul>'), 'should not produce a <ul> for numbered items');
  assert.ok(html.includes('1. First 2. Second'));
});

test('buildNotePage: omits empty sections and includes attribution footer', () => {
  const note = {
    title: 'Test Video',
    channel: 'Test Channel',
    videoId: 'abc',
    captured: '2026-08-14T00:00:00.000Z',
    sections: { summary: '', keyInsights: 'Some insight.', tools: '', skills: '' },
    cues: [{ startSeconds: 5, text: 'hello world' }],
  };

  const html = buildNotePage(note, {
    toolUrl: 'https://github.com/example/tool',
    indexHref: '../index.html',
    styleHref: '../style.css',
    videoUrl: 'https://www.youtube.com/watch?v=abc',
  });

  assert.ok(!html.includes('<h2>Summary</h2>'), 'empty Summary section should not render a heading');
  assert.ok(html.includes('<h2>Key Insights</h2>'));
  assert.ok(html.includes('Some insight.'));
  assert.ok(html.includes('Captured with'));
  assert.ok(html.includes('t=5s'));
});

test('buildNotePage: omits Chapters/Description when absent', () => {
  const note = {
    title: 'No extras',
    channel: 'Channel',
    videoId: 'abc',
    captured: '2026-08-14T00:00:00.000Z',
    sections: { summary: '', keyInsights: '', tools: '', skills: '' },
    cues: [],
  };

  const html = buildNotePage(note, {
    toolUrl: 'https://github.com/example/tool',
    indexHref: '../index.html',
    styleHref: '../style.css',
    videoUrl: 'https://www.youtube.com/watch?v=abc',
  });

  assert.ok(!html.includes('<h2>Chapters</h2>'));
  assert.ok(!html.includes('<h2>Description</h2>'));
});

test('buildNotePage: renders Chapters as timestamp links and Description verbatim, before Transcript', () => {
  const note = {
    title: 'With extras',
    channel: 'Channel',
    videoId: 'abc',
    captured: '2026-08-14T00:00:00.000Z',
    sections: { summary: '', keyInsights: '', tools: '', skills: '' },
    cues: [{ startSeconds: 0, text: 'hi' }],
    chapters: [{ startSeconds: 135, title: 'Section 2' }],
    description: 'Line one\nLine two <with> special & chars',
  };

  const html = buildNotePage(note, {
    toolUrl: 'https://github.com/example/tool',
    indexHref: '../index.html',
    styleHref: '../style.css',
    videoUrl: 'https://www.youtube.com/watch?v=abc',
  });

  assert.ok(html.includes('<h2>Chapters</h2>'));
  assert.ok(html.includes('t=135s'));
  assert.ok(html.includes('Section 2'));
  assert.ok(html.includes('<h2>Description</h2>'));
  assert.ok(html.includes('Line one\nLine two &lt;with&gt; special &amp; chars'), 'description text should be escaped, not parsed as markdown');
  assert.ok(html.indexOf('<h2>Chapters</h2>') < html.indexOf('<h2>Transcript</h2>'));
  assert.ok(html.indexOf('<h2>Description</h2>') < html.indexOf('<h2>Transcript</h2>'));
});

test('sortTopicsWithPinned: pinned topics come first in listed order, rest alphabetical', () => {
  const topics = [
    { name: 'Zebra', href: 'zebra/index.html', count: 1 },
    { name: 'Apple', href: 'apple/index.html', count: 2 },
    { name: 'MCP', href: 'mcp/index.html', count: 3 },
  ];

  const ordered = sortTopicsWithPinned(topics, ['MCP']);

  assert.deepEqual(ordered.map((t) => t.name), ['MCP', 'Apple', 'Zebra']);
  assert.equal(ordered[0].pinned, true);
  assert.equal(ordered[1].pinned, false);
  assert.equal(ordered[2].pinned, false);
});

test('sortTopicsWithPinned: unknown pinned names are ignored, matching is case-insensitive', () => {
  const topics = [{ name: 'MCP', href: 'mcp/index.html', count: 1 }];
  const ordered = sortTopicsWithPinned(topics, ['mcp', 'Nonexistent Topic']);
  assert.equal(ordered.length, 1);
  assert.equal(ordered[0].pinned, true);
});

test('sortNotesByRecency: newest first, missing/invalid dates sort last', () => {
  const notes = [
    { title: 'Old', captured: '2026-01-01T00:00:00.000Z' },
    { title: 'New', captured: '2026-08-01T00:00:00.000Z' },
    { title: 'No date', captured: '' },
  ];

  const sorted = sortNotesByRecency(notes);
  assert.deepEqual(sorted.map((n) => n.title), ['New', 'Old', 'No date']);
});

test('buildTopicPage: sorts notes newest-first and hides search box for a single note', () => {
  const notes = [
    { title: 'Old note', channel: 'Ch', href: 'old.html', captured: '2026-01-01T00:00:00.000Z', sections: {} },
    { title: 'New note', channel: 'Ch', href: 'new.html', captured: '2026-08-01T00:00:00.000Z', sections: {} },
  ];

  const html = buildTopicPage('My Topic', notes, {
    toolUrl: 'https://github.com/example/tool',
    indexHref: '../index.html',
    styleHref: '../style.css',
  });

  assert.ok(html.indexOf('New note') < html.indexOf('Old note'), 'newer note should appear first');
  assert.ok(html.includes('id="site-search"'));

  const singleNoteHtml = buildTopicPage('My Topic', [notes[0]], {
    toolUrl: 'https://github.com/example/tool',
    indexHref: '../index.html',
    styleHref: '../style.css',
  });
  assert.ok(!singleNoteHtml.includes('id="site-search"'), 'a single note does not need a search box');
});

test('buildIndexPage: renders Pinned and All topics as separate sections, plus Recently captured', () => {
  const topics = [
    { name: 'Zebra Topic', href: 'zebra/index.html', count: 1 },
    { name: 'MCP', href: 'mcp/index.html', count: 2 },
  ];
  const recentNotes = [
    { title: 'Recent A', channel: 'Ch', topic: 'MCP', href: 'mcp/a.html', captured: '2026-08-10T00:00:00.000Z', sections: {} },
    { title: 'Recent B', channel: 'Ch', topic: 'Zebra Topic', href: 'zebra/b.html', captured: '2026-08-12T00:00:00.000Z', sections: {} },
  ];

  const html = buildIndexPage(topics, recentNotes, {
    toolUrl: 'https://github.com/example/tool',
    styleHref: 'style.css',
    siteTitle: 'My Journal',
    pinnedTopics: ['MCP'],
  });

  assert.ok(html.includes('<h2>Pinned</h2>'));
  assert.ok(html.includes('<h2>All topics</h2>'));
  assert.ok(html.includes('<h2>Recently captured</h2>'));
  // The pinned MCP topic link should appear after the Pinned heading and before All topics.
  assert.ok(html.indexOf('<h2>Pinned</h2>') < html.indexOf('mcp/index.html'));
  assert.ok(html.indexOf('mcp/index.html') < html.indexOf('<h2>All topics</h2>'));
  assert.ok(html.indexOf('Recent B') < html.indexOf('Recent A'), 'recent notes should be newest-first');
  assert.ok(html.includes('2 topics'));
  assert.ok(html.includes('3 notes'));
});

test('buildIndexPage: omits Pinned section and search box when nothing is pinned and there is only one topic', () => {
  const topics = [{ name: 'Only Topic', href: 'only/index.html', count: 1 }];
  const html = buildIndexPage(topics, [], {
    toolUrl: 'https://github.com/example/tool',
    styleHref: 'style.css',
    siteTitle: 'My Journal',
  });

  assert.ok(!html.includes('<h2>Pinned</h2>'));
  assert.ok(html.includes('<h2>Topics</h2>'));
  assert.ok(!html.includes('id="site-search"'));
});

test('buildSiteFiles: produces style.css first, index.html last, and a page per note/topic', () => {
  const noteMd = buildMarkdown({
    title: 'My Video',
    channel: 'Ch',
    url: 'https://www.youtube.com/watch?v=abc',
    videoId: 'abc',
    captureDate: '2026-08-14T00:00:00.000Z',
    topic: 'MCP',
    cues: [{ startSeconds: 0, text: 'hello' }],
  });

  const topicsRaw = {
    MCP: [{ filename: 'my-video.md', content: noteMd }],
  };

  const files = buildSiteFiles(topicsRaw, { toolUrl: 'https://github.com/example/tool', siteTitle: 'My Journal', pinnedTopics: [] });

  assert.equal(files[0].path, 'style.css');
  assert.equal(files[files.length - 1].path, 'index.html');
  assert.ok(files.some((f) => f.path === 'mcp/my-video.html'));
  assert.ok(files.some((f) => f.path === 'mcp/index.html'));
  assert.ok(files[files.length - 1].content.includes('My Journal'));
});

test('buildSiteFiles: respects pinnedTopics in the generated index', () => {
  const noteMd = buildMarkdown({
    title: 'Video',
    channel: 'Ch',
    url: 'https://www.youtube.com/watch?v=xyz',
    videoId: 'xyz',
    captureDate: '2026-08-14T00:00:00.000Z',
    topic: 'Zebra',
    cues: [],
  });

  const topicsRaw = {
    Zebra: [{ filename: 'v.md', content: noteMd }],
    Apple: [{ filename: 'v.md', content: noteMd }],
  };

  const files = buildSiteFiles(topicsRaw, { toolUrl: 'https://github.com/example/tool', siteTitle: 'Journal', pinnedTopics: ['Zebra'] });
  const indexHtml = files[files.length - 1].content;

  assert.ok(indexHtml.indexOf('<h2>Pinned</h2>') < indexHtml.indexOf('zebra/index.html'));
});
