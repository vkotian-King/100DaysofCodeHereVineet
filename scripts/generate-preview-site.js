// Dev-only utility: renders the real notes in a vault folder into a local HTML
// preview using lib/siteGenerator.js's buildSiteFiles() — the same orchestration
// function the real Publish feature uses — without touching GitHub. Lets us
// evaluate output quality (and catch regressions) before/without publishing.
//
// Usage: node scripts/generate-preview-site.js <vaultDir> <outputDir>
//
// Optional: a "pinned-topics.json" file at the root of <vaultDir> containing a
// JSON array of topic (folder) names, e.g. ["MCP updated", "Context Engineering"].
// Those topics are pinned to the top of the index page, in the order listed.

import fs from 'node:fs';
import path from 'node:path';

import { parseVaultNote, hasUserContent } from '../lib/vaultNoteParser.js';
import { buildSiteFiles, DEFAULT_TOOL_URL } from '../lib/siteGenerator.js';

const PINNED_TOPICS_FILENAME = 'pinned-topics.json';

function readVault(vaultDir) {
  const topicsRaw = {};
  for (const entry of fs.readdirSync(vaultDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const topicDir = path.join(vaultDir, entry.name);
    const notes = [];
    for (const file of fs.readdirSync(topicDir)) {
      if (!file.endsWith('.md')) continue;
      const content = fs.readFileSync(path.join(topicDir, file), 'utf8');
      notes.push({ filename: file, content });
    }
    topicsRaw[entry.name] = notes;
  }
  return topicsRaw;
}

function readPinnedTopics(vaultDir) {
  const pinnedPath = path.join(vaultDir, PINNED_TOPICS_FILENAME);
  if (!fs.existsSync(pinnedPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(pinnedPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    console.error(`[generate-preview-site] could not parse ${PINNED_TOPICS_FILENAME}, ignoring it`);
    return [];
  }
}

function buildValueReport(topicsRaw) {
  const report = { publishable: [], draftsExcludedFromValueCheck: [] };
  for (const [topicName, notes] of Object.entries(topicsRaw)) {
    for (const { filename, content } of notes) {
      const parsed = parseVaultNote(content);
      const record = { topic: topicName, filename };
      if (hasUserContent(parsed)) {
        report.publishable.push(record);
      } else {
        report.draftsExcludedFromValueCheck.push(record);
      }
    }
  }
  return report;
}

function main() {
  const [, , vaultDir, outputDir] = process.argv;
  if (!vaultDir || !outputDir) {
    console.error('Usage: node scripts/generate-preview-site.js <vaultDir> <outputDir>');
    process.exit(1);
  }

  const topicsRaw = readVault(vaultDir);
  const pinnedTopics = readPinnedTopics(vaultDir);
  const topicCount = Object.keys(topicsRaw).length;
  const noteCount = Object.values(topicsRaw).reduce((n, notes) => n + notes.length, 0);

  const files = buildSiteFiles(topicsRaw, {
    toolUrl: DEFAULT_TOOL_URL,
    siteTitle: 'My learning journal',
    pinnedTopics,
  });

  fs.mkdirSync(outputDir, { recursive: true });
  for (const file of files) {
    const outPath = path.join(outputDir, file.path);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, file.content);
  }

  const report = buildValueReport(topicsRaw);

  console.log(`Generated preview site at: ${outputDir}`);
  console.log(`Topics: ${topicCount}, notes total: ${noteCount}`);
  if (pinnedTopics.length > 0) console.log(`Pinned topics: ${pinnedTopics.join(', ')}`);
  console.log(`\nNotes with at least one filled-in section (Summary/Key Insights/Tools/Skills): ${report.publishable.length}`);
  report.publishable.forEach((r) => console.log(`  [has content] ${r.topic}/${r.filename}`));
  console.log(`\nNotes with ALL FOUR sections still empty (transcript-only, currently low standalone value): ${report.draftsExcludedFromValueCheck.length}`);
  report.draftsExcludedFromValueCheck.forEach((r) => console.log(`  [empty template] ${r.topic}/${r.filename}`));
}

main();
