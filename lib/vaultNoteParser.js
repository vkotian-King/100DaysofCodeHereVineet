const HEADINGS = ['Chapters', 'Description', 'Summary', 'Key Insights', 'Tools / Frameworks Mentioned', 'Skills', 'Transcript'];
const SECTION_KEYS = { 'Summary': 'summary', 'Key Insights': 'keyInsights', 'Tools / Frameworks Mentioned': 'tools', 'Skills': 'skills' };

function unescapeYamlString(value) {
  return String(value || '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function parseFrontMatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { fields: {}, rest: text };

  const fields = {};
  for (const line of match[1].split('\n')) {
    const lineMatch = line.match(/^(\w+):\s(.*)$/);
    if (!lineMatch) continue;
    const [, key, rawValue] = lineMatch;
    const isQuoted = rawValue.startsWith('"') && rawValue.endsWith('"');
    fields[key] = isQuoted ? unescapeYamlString(rawValue.slice(1, -1)) : rawValue;
  }

  return { fields, rest: text.slice(match[0].length) };
}

function splitIntoSections(bodyText) {
  const headingPattern = HEADINGS.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`^## (${headingPattern})\\s*$`, 'gm');

  const sections = {};
  const matches = [...bodyText.matchAll(re)];

  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i][1];
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : bodyText.length;
    sections[heading] = bodyText.slice(start, end).trim();
  }

  return sections;
}

// Shared by the Transcript and Chapters sections — both are just a list of
// "- [timestamp](link&t=Ns) label" lines, differing only in what the label means.
function parseTimestampedList(rawText, labelKey) {
  if (!rawText) return [];
  const lineRe = /^- \[(.+?)\]\((.+?)\) (.*)$/;
  const items = [];

  for (const line of rawText.split('\n')) {
    const match = line.match(lineRe);
    if (match) {
      const [, , link, firstLineLabel] = match;
      const secondsMatch = link.match(/[?&]t=(\d+)s/);
      items.push({
        startSeconds: secondsMatch ? Number(secondsMatch[1]) : 0,
        [labelKey]: firstLineLabel.trim(),
      });
    } else if (items.length > 0 && line.trim()) {
      // A label can contain an embedded newline (transcript cues in particular —
      // YouTube renders some caption cues as two visual lines); anything not
      // starting a new "- [ts](link)" entry continues the previous item's label.
      items[items.length - 1][labelKey] = `${items[items.length - 1][labelKey]} ${line.trim()}`;
    }
  }

  return items;
}

function parseDescriptionSection(rawText) {
  if (!rawText) return '';
  const fenced = rawText.match(/^```\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1] : rawText.trim();
}

function parseVaultNote(markdownText) {
  const { fields, rest } = parseFrontMatter(markdownText);
  const sections = splitIntoSections(rest);

  const result = {
    title: fields.title || 'Untitled video',
    channel: fields.channel || '',
    source: fields.source || '',
    videoId: fields.video_id || '',
    captured: fields.captured || '',
    topic: fields.topic || '',
    sections: {
      summary: sections['Summary'] || '',
      keyInsights: sections['Key Insights'] || '',
      tools: sections['Tools / Frameworks Mentioned'] || '',
      skills: sections['Skills'] || '',
    },
    cues: parseTimestampedList(sections['Transcript'], 'text'),
    chapters: parseTimestampedList(sections['Chapters'], 'title'),
    description: parseDescriptionSection(sections['Description']),
  };

  return result;
}

function hasUserContent(parsedNote) {
  const { summary, keyInsights, tools, skills } = parsedNote.sections;
  return [summary, keyInsights, tools, skills].some((s) => s && s.trim().length > 0);
}

export { parseVaultNote, hasUserContent, SECTION_KEYS };
