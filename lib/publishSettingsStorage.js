const STORAGE_KEY = 'publishSettings';

// chrome.storage.local only — never .sync, which would replicate the PAT to
// every Chrome instance signed into the same Google account.
async function getPublishSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || { pat: '', owner: '', repo: '' };
}

async function setPublishSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

export { getPublishSettings, setPublishSettings };
