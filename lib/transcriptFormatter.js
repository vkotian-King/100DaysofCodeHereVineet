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

function buildMarkdown({ title, channel, url, videoId, captureDate, topic, cues }) {
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

  const headings = [
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
  ].join('\n');

  const transcriptLines = (cues || []).map((cue) => {
    const seconds = Math.floor(cue.startSeconds);
    const label = formatTimestamp(cue.startSeconds);
    const link = `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`;
    return `- [${label}](${link}) ${cue.text}`;
  }).join('\n');

  return `${frontMatter}\n${headings}${transcriptLines}\n`;
}

export { formatTimestamp, buildMarkdown };
