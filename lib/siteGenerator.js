import { formatTimestamp } from './transcriptFormatter.js';

const SECTION_LABELS = [
  ['summary', 'Summary'],
  ['keyInsights', 'Key Insights'],
  ['tools', 'Tools / Frameworks Mentioned'],
  ['skills', 'Skills'],
];

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugifyForUrl(str) {
  const slug = String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

// Renders our supported markdown subset (bold, italic, links) on already-escaped text.
// Anything outside this subset (headings, numbered lists, code spans, tables, etc.)
// was never matched by these patterns, so it passes through as plain escaped text
// rather than being mis-rendered as structure.
function renderInlineMarkdown(escapedText) {
  return escapedText
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?:\*([^*]+?)\*|_([^_]+?)_)/g, (_m, a, b) => `<em>${a || b}</em>`);
}

// Renders a user-filled section: blank-line-separated blocks become paragraphs,
// unless every non-empty line in a block starts with "-"/"*", in which case the
// block becomes a flat (non-nested) unordered list.
function renderUserSection(rawText) {
  const blocks = String(rawText || '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const isList = lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l));

    if (isList) {
      const items = lines
        .map((l) => renderInlineMarkdown(escapeHtml(l.replace(/^[-*]\s+/, ''))))
        .map((li) => `<li>${li}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    }

    return `<p>${renderInlineMarkdown(escapeHtml(lines.join(' ')))}</p>`;
  }).join('\n');
}

function formatCapturedDate(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString || '';
  return d.toISOString().slice(0, 10);
}

function buildStylesheet() {
  return `:root { color-scheme: light; }
body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 760px; margin: 0 auto; padding: 2rem 1.25rem 4rem; line-height: 1.6; color: #1b1b1b; }
a { color: #1f4e9e; }
h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
h2 { font-size: 1.15rem; margin-top: 2rem; border-bottom: 1px solid #e2e2e2; padding-bottom: 0.3rem; }
.meta { color: #555; font-size: 0.9rem; margin-top: 0; }
.back-link { display: inline-block; margin-bottom: 1.5rem; font-size: 0.9rem; }
ul.transcript, ul.chapters { list-style: none; padding: 0; }
ul.transcript li, ul.chapters li { margin-bottom: 0.5rem; }
ul.transcript a, ul.chapters a { font-variant-numeric: tabular-nums; margin-right: 0.5rem; color: #1f4e9e; text-decoration: none; }
ul.transcript a:hover, ul.chapters a:hover { text-decoration: underline; }
.description { white-space: pre-wrap; word-wrap: break-word; background: #f6f6f6; border-radius: 6px; padding: 0.75rem 1rem; font-size: 0.9rem; }
.topic-list, .note-list { list-style: none; padding: 0; }
.topic-list li, .note-list li { padding: 0.6rem 0; border-bottom: 1px solid #eee; }
.note-list .note-meta { color: #555; font-size: 0.85rem; }
footer.attribution { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e2e2; font-size: 0.85rem; color: #777; }
`;
}

function buildAttributionFooter(toolUrl) {
  return `<footer class="attribution">Captured with <a href="${escapeHtml(toolUrl)}" target="_blank" rel="noopener">YouTube Transcript Vault</a> — a free, local-first way to build your own learning journal.</footer>`;
}

function buildChaptersHtml(chapters, videoUrl) {
  if (!chapters || chapters.length === 0) return '';
  const items = chapters.map((chapter) => {
    const seconds = Math.floor(chapter.startSeconds);
    const label = formatTimestamp(chapter.startSeconds);
    const link = `${videoUrl}&t=${seconds}s`;
    return `<li><a href="${escapeHtml(link)}" target="_blank" rel="noopener">${label}</a> ${escapeHtml(chapter.title)}</li>`;
  }).join('\n');
  return `<section><h2>Chapters</h2><ul class="chapters">\n${items}\n</ul></section>\n`;
}

function buildDescriptionHtml(description) {
  if (!description || !description.trim()) return '';
  return `<section><h2>Description</h2><pre class="description">${escapeHtml(description.trim())}</pre></section>\n`;
}

function buildNotePage(parsedNote, opts) {
  const { toolUrl, indexHref, videoUrl } = opts;

  const chaptersHtml = buildChaptersHtml(parsedNote.chapters, videoUrl);
  const descriptionHtml = buildDescriptionHtml(parsedNote.description);

  const sectionsHtml = SECTION_LABELS
    .filter(([key]) => parsedNote.sections[key] && parsedNote.sections[key].trim())
    .map(([key, label]) => `<section><h2>${escapeHtml(label)}</h2>${renderUserSection(parsedNote.sections[key])}</section>`)
    .join('\n');

  const transcriptItems = (parsedNote.cues || []).map((cue) => {
    const seconds = Math.floor(cue.startSeconds);
    const label = formatTimestamp(cue.startSeconds);
    const link = `${videoUrl}&t=${seconds}s`;
    return `<li><a href="${escapeHtml(link)}" target="_blank" rel="noopener">${label}</a> ${escapeHtml(cue.text)}</li>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(parsedNote.title)}</title>
<link rel="stylesheet" href="${escapeHtml(opts.styleHref)}" />
</head>
<body>
<a class="back-link" href="${escapeHtml(indexHref)}">&larr; All topics</a>
<article>
<h1>${escapeHtml(parsedNote.title)}</h1>
<p class="meta">${escapeHtml(parsedNote.channel)} &middot; <a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener">Watch on YouTube</a> &middot; captured ${escapeHtml(formatCapturedDate(parsedNote.captured))}</p>
${chaptersHtml}${descriptionHtml}${sectionsHtml}
<section><h2>Transcript</h2><ul class="transcript">
${transcriptItems}
</ul></section>
</article>
${buildAttributionFooter(toolUrl)}
</body>
</html>
`;
}

function buildTopicPage(topicName, notes, opts) {
  const items = notes.map((note) => {
    const teaserSource = SECTION_LABELS.map(([key]) => note.sections[key]).find((s) => s && s.trim());
    const teaser = teaserSource ? escapeHtml(teaserSource.slice(0, 140).split('\n')[0]) : '';
    return `<li><a href="${escapeHtml(note.href)}">${escapeHtml(note.title)}</a><div class="note-meta">${escapeHtml(note.channel)}${teaser ? ' &middot; ' + teaser + '…' : ''}</div></li>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(topicName)}</title>
<link rel="stylesheet" href="${escapeHtml(opts.styleHref)}" />
</head>
<body>
<a class="back-link" href="${escapeHtml(opts.indexHref)}">&larr; All topics</a>
<h1>${escapeHtml(topicName)}</h1>
<ul class="note-list">
${items}
</ul>
${buildAttributionFooter(opts.toolUrl)}
</body>
</html>
`;
}

function buildIndexPage(topics, opts) {
  const items = topics.map((t) => `<li><a href="${escapeHtml(t.href)}">${escapeHtml(t.name)}</a> <span class="note-meta">(${t.count} note${t.count === 1 ? '' : 's'})</span></li>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.siteTitle || 'Learning journal')}</title>
<link rel="stylesheet" href="${escapeHtml(opts.styleHref)}" />
</head>
<body>
<h1>${escapeHtml(opts.siteTitle || 'Learning journal')}</h1>
<ul class="topic-list">
${items}
</ul>
${buildAttributionFooter(opts.toolUrl)}
</body>
</html>
`;
}

export {
  escapeHtml,
  slugifyForUrl,
  renderInlineMarkdown,
  renderUserSection,
  buildStylesheet,
  buildAttributionFooter,
  buildNotePage,
  buildTopicPage,
  buildIndexPage,
};
