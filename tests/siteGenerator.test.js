import test from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, slugifyForUrl, renderInlineMarkdown, renderUserSection, buildNotePage } from '../lib/siteGenerator.js';

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
