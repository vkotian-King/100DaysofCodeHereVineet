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

export { listTopicFolders, ensureTopicFolder, fileExists, writeMarkdownFile };
