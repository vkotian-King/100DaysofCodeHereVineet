async function listTopicFolders(rootHandle) {
  const names = [];
  for await (const [name, entry] of rootHandle.entries()) {
    if (entry.kind === 'directory') names.push(name);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

async function ensureTopicFolder(rootHandle, topicName) {
  return rootHandle.getDirectoryHandle(topicName, { create: true });
}

async function fileExists(dirHandle, filename) {
  try {
    await dirHandle.getFileHandle(filename, { create: false });
    return true;
  } catch (err) {
    if (err && err.name === 'NotFoundError') return false;
    throw err;
  }
}

async function writeMarkdownFile(dirHandle, filename, content) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}

// Walks every topic folder and its .md files, returning raw file contents keyed
// by topic name — the real-vault equivalent of the dev preview script's
// readVault(), needed because publishing reads already-saved notes, not just
// the last capture.
async function writeBinaryFile(dirHandle, filename, blob) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
}

async function readAllVaultNotes(rootHandle) {
  const result = {};
  for await (const [topicName, topicEntry] of rootHandle.entries()) {
    if (topicEntry.kind !== 'directory') continue;
    const notes = [];
    for await (const [filename, fileEntry] of topicEntry.entries()) {
      if (fileEntry.kind !== 'file' || !filename.endsWith('.md')) continue;
      const file = await fileEntry.getFile();
      const content = await file.text();
      notes.push({ filename, content });
    }
    result[topicName] = notes;
  }
  return result;
}


async function readTextFile(dirHandle, filename) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: false });
  const file = await fileHandle.getFile();
  return file.text();
}

async function findNoteByVideoId(rootHandle, videoId) {
  const marker = `video_id: ${videoId}`;
  for await (const [topicName, topicEntry] of rootHandle.entries()) {
    if (topicEntry.kind !== 'directory') continue;
    for await (const [filename, fileEntry] of topicEntry.entries()) {
      if (fileEntry.kind !== 'file' || !filename.endsWith('.md')) continue;
      const file = await fileEntry.getFile();
      const content = await file.text();
      if (content.split('\n').some((line) => line.trim() === marker)) {
        return { topic: topicName, filename, content };
      }
    }
  }
  return null;
}

const PINNED_TOPICS_FILENAME = 'pinned-topics.json';

async function readPinnedTopics(rootHandle) {
  try {
    const fileHandle = await rootHandle.getFileHandle(PINNED_TOPICS_FILENAME, { create: false });
    const file = await fileHandle.getFile();
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

async function writePinnedTopics(rootHandle, topicNames) {
  const fileHandle = await rootHandle.getFileHandle(PINNED_TOPICS_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(JSON.stringify(topicNames, null, 2));
  } finally {
    await writable.close();
  }
}

export {
  listTopicFolders,
  ensureTopicFolder,
  fileExists,
  writeMarkdownFile,
  writeBinaryFile,
  readTextFile,
  findNoteByVideoId,
  readAllVaultNotes,
  readPinnedTopics,
  writePinnedTopics,
};
