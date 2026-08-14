import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeFilename, resolveUniqueFilename } from '../lib/filenameSanitizer.js';

test('sanitizeFilename: strips illegal characters', () => {
  assert.equal(sanitizeFilename('How to: Build "AI Agents" | Part 1'), 'How to Build AI Agents Part 1.md');
  assert.equal(sanitizeFilename('React/Vue?*<>|comparison'), 'React Vue comparison.md');
});

test('sanitizeFilename: trims trailing dots and spaces (Windows restriction)', () => {
  assert.equal(sanitizeFilename('Video Title...   '), 'Video Title.md');
});

test('sanitizeFilename: handles Windows reserved names', () => {
  assert.equal(sanitizeFilename('CON'), '_CON.md');
  assert.equal(sanitizeFilename('com1'), '_com1.md');
  assert.equal(sanitizeFilename('CONference'), 'CONference.md');
});

test('sanitizeFilename: truncates very long titles', () => {
  const longTitle = 'x'.repeat(300);
  const result = sanitizeFilename(longTitle);
  assert.ok(result.length <= 154, `expected short filename, got length ${result.length}`);
  assert.ok(result.endsWith('.md'));
});

test('sanitizeFilename: preserves unicode/emoji, falls back on empty result', () => {
  assert.equal(sanitizeFilename('日本語のタイトル 🎉'), '日本語のタイトル 🎉.md');
  assert.equal(sanitizeFilename('???'), 'untitled.md');
  assert.equal(sanitizeFilename(''), 'untitled.md');
  assert.equal(sanitizeFilename(undefined), 'untitled.md');
});

test('resolveUniqueFilename: appends numeric suffix on collision', async () => {
  const existing = new Set(['Video.md', 'Video (2).md']);
  const existsFn = async (_dir, name) => existing.has(name);

  const result = await resolveUniqueFilename({}, 'Video.md', existsFn);
  assert.equal(result, 'Video (3).md');
});

test('resolveUniqueFilename: returns original name when no collision', async () => {
  const existsFn = async () => false;
  const result = await resolveUniqueFilename({}, 'Video.md', existsFn);
  assert.equal(result, 'Video.md');
});
