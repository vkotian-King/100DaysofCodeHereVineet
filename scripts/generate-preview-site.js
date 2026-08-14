// Dev-only utility: renders the real notes in a vault folder into a local HTML
// preview using lib/siteGenerator.js + lib/vaultNoteParser.js, without touching
// GitHub. Lets us evaluate output quality before wiring up real publishing.
//
// Usage: node scripts/generate-preview-site.js <vaultDir> <outputDir>

import fs from 'node:fs';
import path from 'node:path';

import { parseVaultNote, hasUserContent } from '../lib/vaultNoteParser.js';
import { slugifyForUrl, buildStylesheet, buildNotePage, buildTopicPage, buildIndexPage } from '../lib/siteGenerator.js';

const TOOL_URL = 'https://github.com/vkotian-King/100DaysofCodeHereVineet';

function readVault(vaultDir) {
  const topics = [];
  for (const entry of fs.readdirSync(vaultDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const topicDir = path.join(vaultDir, entry.name);
    const notes = [];
    for (const file of fs.readdirSync(topicDir)) {
      if (!file.endsWith('.md')) continue;
      const raw = fs.readFileSync(path.join(topicDir, file), 'utf8');
      const parsed = parseVaultNote(raw);
      notes.push({ parsed, filename: file });
    }
    topics.push({ topicFolderName: entry.name, notes });
  }
  return topics;
}

function main() {
  const [, , vaultDir, outputDir] = process.argv;
  if (!vaultDir || !outputDir) {
    console.error('Usage: node scripts/generate-preview-site.js <vaultDir> <outputDir>');
    process.exit(1);
  }

  const topics = readVault(vaultDir);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'style.css'), buildStylesheet());

  const report = { publishable: [], draftsExcludedFromValueCheck: [] };
  const indexEntries = [];

  for (const topic of topics) {
    const topicSlug = slugifyForUrl(topic.topicFolderName);
    const topicDir = path.join(outputDir, topicSlug);
    fs.mkdirSync(topicDir, { recursive: true });

    const noteLinks = [];
    for (const { parsed, filename } of topic.notes) {
      const noteSlug = slugifyForUrl(parsed.title);
      const noteHref = `${topicSlug}/${noteSlug}.html`;
      const videoUrl = parsed.source || `https://www.youtube.com/watch?v=${parsed.videoId}`;

      const html = buildNotePage(parsed, {
        toolUrl: TOOL_URL,
        indexHref: '../index.html',
        styleHref: '../style.css',
        videoUrl,
      });
      fs.writeFileSync(path.join(topicDir, `${noteSlug}.html`), html);

      const record = { topic: topic.topicFolderName, filename, title: parsed.title, href: noteHref };
      if (hasUserContent(parsed)) {
        report.publishable.push(record);
      } else {
        report.draftsExcludedFromValueCheck.push(record);
      }

      noteLinks.push({ title: parsed.title, channel: parsed.channel, sections: parsed.sections, href: `${noteSlug}.html` });
    }

    const topicHtml = buildTopicPage(topic.topicFolderName, noteLinks, {
      toolUrl: TOOL_URL,
      indexHref: '../index.html',
      styleHref: '../style.css',
    });
    fs.writeFileSync(path.join(topicDir, 'index.html'), topicHtml);

    indexEntries.push({ name: topic.topicFolderName, href: `${topicSlug}/index.html`, count: topic.notes.length });
  }

  const indexHtml = buildIndexPage(indexEntries, {
    toolUrl: TOOL_URL,
    styleHref: 'style.css',
    siteTitle: 'My learning journal',
  });
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);

  console.log(`Generated preview site at: ${outputDir}`);
  console.log(`Topics: ${topics.length}, notes total: ${topics.reduce((n, t) => n + t.notes.length, 0)}`);
  console.log(`\nNotes with at least one filled-in section (Summary/Key Insights/Tools/Skills): ${report.publishable.length}`);
  report.publishable.forEach((r) => console.log(`  [has content] ${r.topic}/${r.filename}`));
  console.log(`\nNotes with ALL FOUR sections still empty (transcript-only, currently low standalone value): ${report.draftsExcludedFromValueCheck.length}`);
  report.draftsExcludedFromValueCheck.forEach((r) => console.log(`  [empty template] ${r.topic}/${r.filename}`));
}

main();
