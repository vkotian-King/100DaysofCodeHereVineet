import { formatTimestamp } from './transcriptFormatter.js';
import { parseVaultNote } from './vaultNoteParser.js';

// Where the attribution footer's "Captured with YouTube Transcript Vault" link
// points — the tool's own home, not the user's published repo. One named
// constant so it's a one-line change if the extension's source ever moves.
const DEFAULT_TOOL_URL = 'https://github.com/vkotian-King/100DaysofCodeHereVineet';

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

// Pinned topics (by name, case-insensitive) come first in the given order;
// everything else follows alphabetically. Unknown pinned names are ignored.
function sortTopicsWithPinned(topics, pinnedNames) {
  const byNameLower = new Map(topics.map((t) => [t.name.toLowerCase(), t]));

  const pinnedOrdered = (pinnedNames || [])
    .map((name) => byNameLower.get(String(name).toLowerCase()))
    .filter(Boolean)
    .map((t) => ({ ...t, pinned: true }));

  const pinnedNameSet = new Set(pinnedOrdered.map((t) => t.name.toLowerCase()));
  const rest = topics
    .filter((t) => !pinnedNameSet.has(t.name.toLowerCase()))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ ...t, pinned: false }));

  return [...pinnedOrdered, ...rest];
}

// Newest first. Notes with an unparseable/missing captured date sort last
// rather than crashing or clumping at the top.
function sortNotesByRecency(notes) {
  return notes.slice().sort((a, b) => {
    const ta = Date.parse(a.captured);
    const tb = Date.parse(b.captured);
    const va = Number.isNaN(ta) ? -Infinity : ta;
    const vb = Number.isNaN(tb) ? -Infinity : tb;
    return vb - va;
  });
}

function buildSearchInput(placeholder) {
  return `<input type="search" id="site-search" class="search-input" placeholder="${escapeHtml(placeholder)}" aria-label="Search" />`;
}

// Vanilla JS, no dependencies: filters any [data-search] item by substring
// match against the search box, and hides a [data-searchable] section
// entirely once none of its items remain visible (so a search doesn't leave
// an empty "Pinned"/"Recently captured" heading floating with nothing under it).
function buildSearchScript() {
  return `<script>
(function () {
  var input = document.getElementById('site-search');
  if (!input) return;
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-search]'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('[data-searchable]'));
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    items.forEach(function (el) {
      var match = !q || el.getAttribute('data-search').indexOf(q) !== -1;
      el.style.display = match ? '' : 'none';
    });
    sections.forEach(function (section) {
      var anyVisible = Array.prototype.slice.call(section.querySelectorAll('[data-search]'))
        .some(function (el) { return el.style.display !== 'none'; });
      section.style.display = anyVisible ? '' : 'none';
    });
  });
})();
</script>`;
}

function buildStylesheet() {
  return `:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --surface: #f7f7f5;
  --border: #e6e6e2;
  --text: #1a1a1a;
  --text-muted: #6b6b6b;
  --accent: #1f4e9e;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15171a;
    --surface: #1e2126;
    --border: #2c2f35;
    --text: #eaeaea;
    --text-muted: #9aa0a6;
    --accent: #7aa6f0;
  }
}
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  max-width: 720px;
  margin: 0 auto;
  padding: 3rem 1.5rem 5rem;
  line-height: 1.65;
  background: var(--bg);
  color: var(--text);
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
h1 { font-size: 1.75rem; font-weight: 600; margin: 0 0 0.5rem; letter-spacing: -0.01em; }
h2 { font-size: 0.95rem; font-weight: 600; margin: 2.5rem 0 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
.meta { color: var(--text-muted); font-size: 0.9rem; margin: 0 0 2rem; }
.back-link { display: inline-block; margin-bottom: 2rem; font-size: 0.85rem; color: var(--text-muted); }
.back-link:hover { color: var(--accent); }
.search-input { display: block; width: 100%; padding: 0.65rem 0.9rem; margin: 0 0 1rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font-size: 0.95rem; font-family: inherit; }
.search-input:focus { outline: none; border-color: var(--accent); }
ul.transcript, ul.chapters { list-style: none; padding: 0; margin: 0; }
ul.transcript li, ul.chapters li { padding: 0.4rem 0; border-bottom: 1px solid var(--border); }
ul.transcript li:last-child, ul.chapters li:last-child { border-bottom: none; }
ul.transcript a, ul.chapters a { font-variant-numeric: tabular-nums; font-size: 0.85rem; margin-right: 0.75rem; }
.description { white-space: pre-wrap; word-wrap: break-word; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.25rem; font-size: 0.88rem; }
.topic-list, .note-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.topic-list li, .note-list li { padding: 1rem 1.25rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); transition: border-color 0.15s ease; }
.topic-list li:hover, .note-list li:hover { border-color: var(--accent); }
.topic-list a, .note-list a { font-weight: 500; font-size: 1rem; }
.note-list .note-meta { color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem; }
footer.attribution { margin-top: 4rem; padding-top: 1.25rem; border-top: 1px solid var(--border); font-size: 0.8rem; color: var(--text-muted); }
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

function buildNoteListItem(note) {
  const teaserSource = SECTION_LABELS.map(([key]) => note.sections && note.sections[key]).find((s) => s && s.trim());
  const teaser = teaserSource ? escapeHtml(teaserSource.slice(0, 140).split('\n')[0]) : '';
  const searchText = escapeHtml(`${note.title} ${note.channel || ''} ${note.topic || ''}`.toLowerCase());
  const metaLine = [escapeHtml(note.channel || ''), note.topic ? escapeHtml(note.topic) : '', teaser ? teaser + '…' : '']
    .filter(Boolean)
    .join(' &middot; ');
  return `<li data-search="${searchText}"><a href="${escapeHtml(note.href)}">${escapeHtml(note.title)}</a>${metaLine ? `<div class="note-meta">${metaLine}</div>` : ''}</li>`;
}

function buildTopicPage(topicName, notes, opts) {
  const sorted = sortNotesByRecency(notes);
  const items = sorted.map(buildNoteListItem).join('\n');

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
<p class="meta">${sorted.length} note${sorted.length === 1 ? '' : 's'}</p>
${sorted.length > 1 ? buildSearchInput('Search notes…') : ''}
<section data-searchable><ul class="note-list">
${items}
</ul></section>
${buildAttributionFooter(opts.toolUrl)}
${sorted.length > 1 ? buildSearchScript() : ''}
</body>
</html>
`;
}

function buildIndexPage(topics, recentNotes, opts) {
  const ordered = sortTopicsWithPinned(topics, opts.pinnedTopics || []);
  const pinnedTopics = ordered.filter((t) => t.pinned);
  const otherTopics = ordered.filter((t) => !t.pinned);
  const totalNotes = topics.reduce((sum, t) => sum + t.count, 0);
  const hasSearch = topics.length > 1 || (recentNotes || []).length > 1;

  const renderTopicItem = (t) => `<li data-search="${escapeHtml(t.name.toLowerCase())}"><a href="${escapeHtml(t.href)}">${escapeHtml(t.name)}</a> <span class="note-meta">${t.count} note${t.count === 1 ? '' : 's'}</span></li>`;

  const pinnedHtml = pinnedTopics.length > 0
    ? `<section data-searchable><h2>Pinned</h2><ul class="topic-list">\n${pinnedTopics.map(renderTopicItem).join('\n')}\n</ul></section>\n`
    : '';

  const otherHtml = otherTopics.length > 0
    ? `<section data-searchable><h2>${pinnedTopics.length > 0 ? 'All topics' : 'Topics'}</h2><ul class="topic-list">\n${otherTopics.map(renderTopicItem).join('\n')}\n</ul></section>\n`
    : '';

  const recentLimit = opts.recentLimit || 8;
  const recentSorted = sortNotesByRecency(recentNotes || []).slice(0, recentLimit);
  const recentHtml = recentSorted.length > 0
    ? `<section data-searchable><h2>Recently captured</h2><ul class="note-list">\n${recentSorted.map(buildNoteListItem).join('\n')}\n</ul></section>\n`
    : '';

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
<p class="meta">${topics.length} topic${topics.length === 1 ? '' : 's'} &middot; ${totalNotes} note${totalNotes === 1 ? '' : 's'}</p>
${hasSearch ? buildSearchInput('Search topics and notes…') : ''}
${recentHtml}${pinnedHtml}${otherHtml}
${buildAttributionFooter(opts.toolUrl)}
${hasSearch ? buildSearchScript() : ''}
</body>
</html>
`;
}

// Turns raw vault contents into the full set of files a published site needs.
// topicsRaw: { [topicName]: [{ filename, content }] } — exactly what
// fsOps.readAllVaultNotes() (real vault) and the dev preview script's
// readVault() (local filesystem) both produce, so this one function is the
// single source of truth for both the local preview and the real publish flow.
// Returns an array of {path, content} already in safe upload order: style.css,
// then every note/topic page, then index.html last (see githubPublisher.js's
// publishAll for why that order matters).
function buildSiteFiles(topicsRaw, opts) {
  const toolUrl = opts.toolUrl || DEFAULT_TOOL_URL;
  const files = [];
  const indexEntries = [];
  const allNotesFlat = [];

  for (const [topicName, notes] of Object.entries(topicsRaw)) {
    const topicSlug = slugifyForUrl(topicName);
    const noteLinks = [];

    for (const { content } of notes) {
      const parsed = parseVaultNote(content);
      const noteSlug = slugifyForUrl(parsed.title);
      const noteHref = `${topicSlug}/${noteSlug}.html`;
      const videoUrl = parsed.source || `https://www.youtube.com/watch?v=${parsed.videoId}`;

      const html = buildNotePage(parsed, {
        toolUrl,
        indexHref: '../index.html',
        styleHref: '../style.css',
        videoUrl,
      });
      files.push({ path: noteHref, content: html });

      const noteSummary = {
        title: parsed.title,
        channel: parsed.channel,
        topic: topicName,
        captured: parsed.captured,
        sections: parsed.sections,
      };
      noteLinks.push({ ...noteSummary, href: `${noteSlug}.html` });
      allNotesFlat.push({ ...noteSummary, href: noteHref });
    }

    const topicHtml = buildTopicPage(topicName, noteLinks, {
      toolUrl: opts.toolUrl,
      indexHref: '../index.html',
      styleHref: '../style.css',
    });
    files.push({ path: `${topicSlug}/index.html`, content: topicHtml });

    indexEntries.push({ name: topicName, href: `${topicSlug}/index.html`, count: notes.length });
  }

  const indexHtml = buildIndexPage(indexEntries, allNotesFlat, {
    toolUrl: opts.toolUrl,
    styleHref: 'style.css',
    siteTitle: opts.siteTitle,
    pinnedTopics: opts.pinnedTopics,
    recentLimit: opts.recentLimit,
  });

  return [
    { path: 'style.css', content: buildStylesheet() },
    ...files,
    { path: 'index.html', content: indexHtml },
  ];
}

export {
  DEFAULT_TOOL_URL,
  escapeHtml,
  slugifyForUrl,
  renderInlineMarkdown,
  renderUserSection,
  sortTopicsWithPinned,
  sortNotesByRecency,
  buildStylesheet,
  buildAttributionFooter,
  buildSiteFiles,
  buildNotePage,
  buildTopicPage,
  buildIndexPage,
};
