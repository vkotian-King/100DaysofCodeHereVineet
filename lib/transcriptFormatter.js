function formatTimestamp(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function escapeYamlString(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildChaptersSection(chapters, videoId) {
  if (!chapters || chapters.length === 0) return '';
  const lines = chapters.map((chapter) => {
    const seconds = Math.floor(chapter.startSeconds);
    const label = formatTimestamp(chapter.startSeconds);
    const link = `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`;
    return `- [${label}](${link}) ${chapter.title}`;
  }).join('\n');
  return `## Chapters\n\n${lines}\n\n`;
}

function buildDescriptionSection(description) {
  if (!description || !description.trim()) return '';
  return `## Description\n\n\`\`\`\n${description.trim()}\n\`\`\`\n\n`;
}

function buildMarkdown({ title, channel, url, videoId, captureDate, topic, cues, description, chapters }) {
  const frontMatter = [
    '---',
    `title: "${escapeYamlString(title)}"`,
    `channel: "${escapeYamlString(channel)}"`,
    `source: ${url}`,
    `video_id: ${videoId}`,
    `captured: ${captureDate}`,
    `topic: ${topic}`,
    '---',
    '',
  ].join('\n');

  const chaptersSection = buildChaptersSection(chapters, videoId);
  const descriptionSection = buildDescriptionSection(description);

  const transcriptHeading = '## Transcript\n';

  const transcriptLines = (cues || []).map((cue) => {
    const seconds = Math.floor(cue.startSeconds);
    const label = formatTimestamp(cue.startSeconds);
    const link = `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`;
    return `- [${label}](${link}) ${cue.text}`;
  }).join('\n');

  return `${frontMatter}\n${chaptersSection}${descriptionSection}${transcriptHeading}${transcriptLines}\n`;
}

export { formatTimestamp, buildMarkdown };
