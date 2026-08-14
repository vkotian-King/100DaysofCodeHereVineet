import { getVaultHandle, setVaultHandle } from '../lib/vaultStorage.js';
import { listTopicFolders, ensureTopicFolder, fileExists, writeMarkdownFile } from '../lib/fsOps.js';
import { buildMarkdown } from '../lib/transcriptFormatter.js';
import { sanitizeFilename } from '../lib/filenameSanitizer.js';

const vaultStatusEl = document.getElementById('vaultStatus');
const selectVaultBtn = document.getElementById('selectVaultBtn');
const regrantBtn = document.getElementById('regrantBtn');
const captureSection = document.getElementById('captureSection');
const captureBtn = document.getElementById('captureBtn');
const captureStatusEl = document.getElementById('captureStatus');
const previewArea = document.getElementById('previewArea');
const previewTitleEl = document.getElementById('previewTitle');
const previewMetaEl = document.getElementById('previewMeta');
const topicInput = document.getElementById('topicInput');
const topicOptions = document.getElementById('topicOptions');
const saveBtn = document.getElementById('saveBtn');
const toastEl = document.getElementById('toast');

let vaultRootHandle = null;
let lastCapture = null; // { title, channel, videoId, url, captureDate, cues }

const FAILURE_MESSAGES = {
  no_player_response: 'Could not read this page. Make sure a YouTube video is loaded and try again.',
  unavailable: 'This video is unavailable (private, age-restricted, or removed) — no transcript can be captured.',
  no_captions: 'This video has no captions available.',
  fetch_failed: 'Could not download the caption track. Try again.',
  unknown_error: 'Something went wrong reading this video. Try again.',
  not_youtube: 'Open a YouTube video tab first, then capture.',
};

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.className = isError ? 'error' : '';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toastEl.hidden = true; }, 4000);
}

async function refreshVaultUi() {
  if (!vaultRootHandle) {
    vaultStatusEl.textContent = 'No vault folder selected yet.';
    selectVaultBtn.hidden = false;
    regrantBtn.hidden = true;
    captureSection.hidden = true;
    return;
  }

  const permission = await vaultRootHandle.queryPermission({ mode: 'readwrite' });
  if (permission === 'granted') {
    vaultStatusEl.textContent = `Vault: ${vaultRootHandle.name}`;
    selectVaultBtn.hidden = true;
    regrantBtn.hidden = true;
    captureSection.hidden = false;
    await refreshTopicList();
  } else {
    vaultStatusEl.textContent = `Vault "${vaultRootHandle.name}" needs access to be re-confirmed.`;
    selectVaultBtn.hidden = true;
    regrantBtn.hidden = false;
    captureSection.hidden = true;
  }
}

async function refreshTopicList() {
  const topics = await listTopicFolders(vaultRootHandle);
  topicOptions.innerHTML = '';
  for (const topic of topics) {
    const opt = document.createElement('option');
    opt.value = topic;
    topicOptions.appendChild(opt);
  }
}

selectVaultBtn.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker();
    await setVaultHandle(handle);
    vaultRootHandle = handle;
    await refreshVaultUi();
  } catch (err) {
    if (err && err.name !== 'AbortError') showToast('Could not select a folder.', true);
  }
});

regrantBtn.addEventListener('click', async () => {
  try {
    const result = await vaultRootHandle.requestPermission({ mode: 'readwrite' });
    if (result === 'granted') {
      await refreshVaultUi();
    } else {
      showToast('Access was not granted.', true);
    }
  } catch (_err) {
    showToast('Could not re-request access.', true);
  }
});

captureBtn.addEventListener('click', async () => {
  previewArea.hidden = true;
  lastCapture = null;
  captureStatusEl.textContent = 'Capturing…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/^https:\/\/www\.youtube\.com\/watch/.test(tab.url)) {
      captureStatusEl.textContent = FAILURE_MESSAGES.not_youtube;
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['content/extractCaptions.js'],
    });

    console.debug('[TranscriptVault] executeScript results:', results);
    const result = results && results[0] && results[0].result;
    if (!result || !result.ok) {
      const reason = (result && result.reason) || 'unknown_error';
      console.error('[TranscriptVault] capture failed, reason:', reason, 'full result:', result);
      captureStatusEl.textContent = FAILURE_MESSAGES[reason] || FAILURE_MESSAGES.unknown_error;
      return;
    }

    const cues = result.cues || [];
    if (cues.length === 0) {
      captureStatusEl.textContent = FAILURE_MESSAGES.no_captions;
      return;
    }

    lastCapture = {
      title: result.title,
      channel: result.channel,
      videoId: result.videoId,
      url: result.url,
      captureDate: result.captureDate,
      cues,
    };

    captureStatusEl.textContent = '';
    previewTitleEl.textContent = lastCapture.title;
    previewMetaEl.textContent = `${lastCapture.channel} — ${cues.length} caption lines`;
    previewArea.hidden = false;
    topicInput.value = '';
    topicInput.focus();
  } catch (err) {
    console.error('[TranscriptVault] captureBtn handler threw:', err);
    captureStatusEl.textContent = FAILURE_MESSAGES.unknown_error;
  }
});

saveBtn.addEventListener('click', async () => {
  if (!lastCapture) return;

  const topic = topicInput.value.trim();
  if (!topic) {
    showToast('Enter or pick a topic folder first.', true);
    return;
  }

  try {
    const topicHandle = await ensureTopicFolder(vaultRootHandle, topic);
    const filename = sanitizeFilename(lastCapture.title);

    if (await fileExists(topicHandle, filename)) {
      const overwrite = window.confirm(`"${filename}" already exists in "${topic}". Overwrite it?`);
      if (!overwrite) return;
    }

    const markdown = buildMarkdown({ ...lastCapture, topic });
    await writeMarkdownFile(topicHandle, filename, markdown);

    showToast(`Saved to ${topic}/${filename}`);
    previewArea.hidden = true;
    lastCapture = null;
    await refreshTopicList();
  } catch (_err) {
    showToast('Could not save the file.', true);
  }
});

(async function init() {
  vaultRootHandle = await getVaultHandle();
  await refreshVaultUi();
})();
