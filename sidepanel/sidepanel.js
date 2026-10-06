import { getVaultHandle, setVaultHandle } from '../lib/vaultStorage.js';
import { listTopicFolders, ensureTopicFolder, fileExists, writeMarkdownFile, writeBinaryFile } from '../lib/fsOps.js';
import { buildMarkdown, formatTimestamp } from '../lib/transcriptFormatter.js';
import { sanitizeFilename } from '../lib/filenameSanitizer.js';
import { refreshPublishPanel } from './publishPanel.js';

const vaultStatusEl = document.getElementById('vaultStatus');
const selectVaultBtn = document.getElementById('selectVaultBtn');
const regrantBtn = document.getElementById('regrantBtn');
const captureSection = document.getElementById('captureSection');
const publishSection = document.getElementById('publishSection');
const captureBtn = document.getElementById('captureBtn');
const captureStatusEl = document.getElementById('captureStatus');
const previewArea = document.getElementById('previewArea');
const previewTitleEl = document.getElementById('previewTitle');
const previewMetaEl = document.getElementById('previewMeta');
const topicInput = document.getElementById('topicInput');
const topicOptions = document.getElementById('topicOptions');
const saveBtn = document.getElementById('saveBtn');
const visualCaptureArea = document.getElementById('visualCaptureArea');
const visualCaptureBtn = document.getElementById('captureVisualBtn');
const visualCaptureStatus = document.getElementById('visualCaptureStatus');
const visualList = document.getElementById('visualList');
const toastEl = document.getElementById('toast');

let vaultRootHandle = null;
let lastCapture = null; // { title, channel, videoId, url, captureDate, cues, visuals }

const FAILURE_MESSAGES = {
  no_player_response: 'Could not read this page. Make sure a YouTube video is loaded and try again.',
  unavailable: 'This video is unavailable (private, age-restricted, or removed) — no transcript can be captured.',
  no_captions: 'This video has no captions available.',
  transcript_required: 'Capture the transcript for this video first.',
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
    publishSection.hidden = true;
    visualCaptureArea.hidden = true;
    return;
  }

  const permission = await vaultRootHandle.queryPermission({ mode: 'readwrite' });
  if (permission === 'granted') {
    vaultStatusEl.textContent = `Vault: ${vaultRootHandle.name}`;
    selectVaultBtn.hidden = true;
    regrantBtn.hidden = true;
    captureSection.hidden = false;
    publishSection.hidden = false;
    visualCaptureArea.hidden = false;
    await refreshTopicList();
    await refreshPublishPanel(vaultRootHandle);
  } else {
    vaultStatusEl.textContent = `Vault "${vaultRootHandle.name}" needs access to be re-confirmed.`;
    selectVaultBtn.hidden = true;
    regrantBtn.hidden = false;
    captureSection.hidden = true;
    publishSection.hidden = true;
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

async function captureCurrentFrame() {
  console.debug('[TranscriptVault] visual capture: start');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/^https:\/\/www\.youtube\.com\/watch/.test(tab.url)) {
    throw new Error('not_youtube');
  }

  console.debug('[TranscriptVault] visual capture: tab', { id: tab.id, url: tab.url, windowId: tab.windowId });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    files: ['content/extractVisualFrame.js'],
  });
  console.debug('[TranscriptVault] visual capture: frame script result', results);
  const frame = results && results[0] && results[0].result;
  if (!frame || !frame.ok) throw new Error((frame && frame.reason) || 'unknown_error');

  console.debug('[TranscriptVault] visual capture: frame geometry', frame);
  console.debug('[TranscriptVault] visual capture: requesting screenshot from service worker');
  const screenshot = await chrome.runtime.sendMessage({
    type: 'capture-visible-tab',
    windowId: tab.windowId,
  });
  if (!screenshot?.ok) throw new Error(screenshot?.error || 'capture_failed');
  const dataUrl = screenshot.dataUrl;
  console.debug('[TranscriptVault] visual capture: screenshot received', { length: dataUrl?.length });

  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = dataUrl;
  });

  const scaleX = image.naturalWidth / frame.viewport.width;
  const scaleY = image.naturalHeight / frame.viewport.height;
  const x = Math.max(0, Math.round(frame.rect.x * scaleX));
  const y = Math.max(0, Math.round(frame.rect.y * scaleY));
  const width = Math.min(image.naturalWidth - x, Math.round(frame.rect.width * scaleX));
  const height = Math.min(image.naturalHeight - y, Math.round(frame.rect.height * scaleY));
  if (width <= 0 || height <= 0) throw new Error('invalid_crop');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);

  return { currentTime: frame.currentTime, blob: await new Promise(resolve => canvas.toBlob(resolve, 'image/png')) };
}

function visualFilename(seconds, index) {
  const stamp = formatTimestamp(seconds).replace(/:/g, '-');
  return `visual-${stamp}-${String(index).padStart(2, '0')}.png`;
}

function renderVisualList() {
  visualList.innerHTML = '';
  for (const visual of (lastCapture.visuals || [])) {
    const row = document.createElement('div');
    row.className = 'visual-row';
    row.textContent = `${formatTimestamp(visual.startSeconds)} — ${visual.filename}`;
    visualList.appendChild(row);
  }
}

visualCaptureBtn.addEventListener('click', async () => {
  visualCaptureStatus.textContent = 'Capturing…';
  try {
    const { currentTime, blob } = await captureCurrentFrame();
    if (!lastCapture) throw new Error('transcript_required');
    const index = (lastCapture.visuals || []).length + 1;
    lastCapture.visuals.push({
      startSeconds: currentTime,
      filename: visualFilename(currentTime, index),
      blob,
    });
    renderVisualList();
    visualCaptureStatus.textContent = `Captured at ${formatTimestamp(currentTime)}.`;
  } catch (err) {
    console.error('[TranscriptVault] visual capture failed:', err);
    visualCaptureStatus.textContent = FAILURE_MESSAGES[err.message] || 'Could not capture the current video frame.';
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
      description: result.description || '',
      chapters: result.chapters || [],
      visuals: [],
    };

    captureStatusEl.textContent = '';
    previewTitleEl.textContent = lastCapture.title;
    const chapterNote = lastCapture.chapters.length > 0 ? `, ${lastCapture.chapters.length} chapters` : '';
    previewMetaEl.textContent = `${lastCapture.channel} — ${cues.length} caption lines${chapterNote}`;
    previewArea.hidden = false;
    visualCaptureBtn.disabled = false;
    saveBtn.disabled = false;
    visualCaptureStatus.textContent = 'Pause at an important diagram, slide, or drawing, then capture it.';
    renderVisualList();
    if (!topicInput.value.trim()) topicInput.focus();
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

    for (const visual of lastCapture.visuals || []) {
      await writeBinaryFile(topicHandle, visual.filename, visual.blob);
    }

    const markdown = buildMarkdown({ ...lastCapture, topic });
    await writeMarkdownFile(topicHandle, filename, markdown);

    showToast(`Saved to ${topic}/${filename}${lastCapture.visuals.length ? ` with ${lastCapture.visuals.length} visual moment(s)` : ''}`);
    previewArea.hidden = true;
    visualCaptureBtn.disabled = true;
    saveBtn.disabled = true;
    visualCaptureStatus.textContent = 'Capture a transcript first, then capture diagrams, slides, or drawings while watching.';
    lastCapture = null;
    await refreshTopicList();
    await refreshPublishPanel(vaultRootHandle);
  } catch (_err) {
    showToast('Could not save the file.', true);
  }
});

(async function init() {
  vaultRootHandle = await getVaultHandle();
  await refreshVaultUi();
})();
