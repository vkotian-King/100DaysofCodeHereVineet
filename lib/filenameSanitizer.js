const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i;
const MAX_BASENAME_LENGTH = 150;

function sanitizeFilename(rawTitle) {
  let name = String(rawTitle || 'untitled')
    .replace(ILLEGAL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/g, ''); // Windows disallows trailing dots/spaces

  if (!name) name = 'untitled';
  if (WINDOWS_RESERVED.test(name)) name = `_${name}`;
  if (name.length > MAX_BASENAME_LENGTH) name = name.slice(0, MAX_BASENAME_LENGTH).trim();
  if (!name) name = 'untitled';

  return `${name}.md`;
}

async function resolveUniqueFilename(dirHandle, baseFilename, existsFn) {
  const dotIndex = baseFilename.lastIndexOf('.');
  const stem = dotIndex === -1 ? baseFilename : baseFilename.slice(0, dotIndex);
  const ext = dotIndex === -1 ? '' : baseFilename.slice(dotIndex);

  let candidate = baseFilename;
  let n = 2;
  while (await existsFn(dirHandle, candidate)) {
    candidate = `${stem} (${n})${ext}`;
    n += 1;
  }
  return candidate;
}

export { sanitizeFilename, resolveUniqueFilename };
