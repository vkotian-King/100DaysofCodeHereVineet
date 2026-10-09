import { getVaultHandle, setVaultHandle } from '../lib/vaultStorage.js';
import { listTopicFolders, ensureTopicFolder, fileExists, writeMarkdownFile, writeBinaryFile, findNoteByVideoId, readTextFile } from '../lib/fsOps.js';
import { buildMarkdown, buildVisualsSection, formatTimestamp } from '../lib/transcriptFormatter.js';
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
const visualCaptureArea = document.getElementById('visualCaptureArea');
const visualCaptureBtn = document.getElementById('captureVisualBtn');
const visualCaptureStatus = document.getElementById('visualCaptureStatus');
const visualList = document.getElementById('visualList');
const toastEl = document.getElementById('toast');

let vaultRootHandle = null;
let lastCapture = null;
let currentNote = null;
const LAST_TOPIC_KEY = 'transcriptVaultLastTopic';

const FAILURE_MESSAGES = {
  no_player_response: 'Could not read this page. Make sure a YouTube video is loaded and try again.',
  unavailable: 'This video is unavailable (private, age-restricted, or removed) — no transcript can be captured.',
  no_captions: 'This video has no captions available.',
  transcript_required: 'Capture the transcript for this video first.',
  fetch_failed: 'Could not download the caption track. Try again.',
  unknown_error: 'Something went wrong reading this video. Try again.',
  note_exists_without_video_id: 'A note with this title already exists but is not linked to this video. Please resolve the existing note before retrying.',
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
    const saved = await chrome.storage.local.get(LAST_TOPIC_KEY);
    if (saved[LAST_TOPIC_KEY]) topicInput.value = saved[LAST_TOPIC_KEY];
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

topicInput.addEventListener('change', async () => {
  const topic = topicInput.value.trim();
  if (topic) await chrome.storage.local.set({ [LAST_TOPIC_KEY]: topic });
});

selectVaultBtn.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker();
    await setVaultHandle(handle);
    vaultRootHandle = handle;
    await refreshVaultUi();
    await resumeExistingNoteForActiveTab();
  } catch (err) {
    if (err && err.name !== 'AbortError') showToast('Could not select a folder.', true);
  }
});

regrantBtn.addEventListener('click', async () => {
  try {
    const result = await vaultRootHandle.requestPermission({ mode: 'readwrite' });
    if (result === 'granted') {
      await refreshVaultUi();
      await resumeExistingNoteForActiveTab();
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


async function resumeExistingNoteForActiveTab() {
  if (!vaultRootHandle || await vaultRootHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https:\/\/www\.youtube\.com\/watch/.test(tab.url)) return;
  const videoId = new URL(tab.url).searchParams.get('v');
  if (!videoId) return;
  const existing = await findNoteByVideoId(vaultRootHandle, videoId);
  if (!existing) return;
  const titleMatch = existing.content.match(/^title: "((?:\\\\.|[^"])*)"/m);
  currentNote = { topic: existing.topic, filename: existing.filename, videoId };
  lastCapture = {
    videoId,
    title: titleMatch ? titleMatch[1].replace(/\\\\(["\\\\])/g, '$1') : existing.filename.replace(/\.md$/, ''),
        visuals: [...existing.content.matchAll(/### \[([^\]]+)\]\(https:\/\/www\.youtube\.com\/watch\?v=[^&]+&t=(\d+)s\)\s*!\[Visual capture at [^\]]+\]\(([^)]+)\)/g)].map(m => ({ startSeconds: Number(m[2]), filename: m[3] })),
  };
  topicInput.value = existing.topic;
  topicInput.disabled = true;
  previewTitleEl.textContent = lastCapture.title;
  previewMetaEl.textContent = 'Existing note found — resumed automatically.';
  previewArea.hidden = false;
  visualCaptureBtn.disabled = false;
  visualCaptureStatus.textContent = 'Resumed. New visual moments are saved automatically.';
  captureStatusEl.textContent = 'Existing note resumed; no transcript recapture needed.';
  renderVisualList();
}

function renderVisualList() {
  visualList.innerHTML = '';
  for (const visual of (lastCapture?.visuals || [])) {
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
    if (!lastCapture || !currentNote) throw new Error('transcript_required');
    const index = (lastCapture.visuals || []).length + 1;
    const filename = visualFilename(currentTime, index);
    const topicHandle = await ensureTopicFolder(vaultRootHandle, currentNote.topic);
    await writeBinaryFile(topicHandle, filename, blob);
    lastCapture.visuals.push({ startSeconds: currentTime, filename });
    const existingMarkdown = await readTextFile(topicHandle, currentNote.filename);
    const visualsMarkdown = buildVisualsSection(lastCapture.visuals, lastCapture.videoId);
    let updatedMarkdown;
    if (existingMarkdown.includes('## Visual Moments')) {
      updatedMarkdown = existingMarkdown.replace(/## Visual Moments\n[\s\S]*?(?=\n## |$)/, visualsMarkdown.trimEnd() + '\n');
    } else {
      updatedMarkdown = existingMarkdown.replace(/## Transcript\n/, visualsMarkdown + '\n## Transcript\n');
    }
    await writeMarkdownFile(topicHandle, currentNote.filename, updatedMarkdown);
    renderVisualList();
    visualCaptureStatus.textContent = `Saved visual at ${formatTimestamp(currentTime)}.`;
  } catch (err) {
    console.error('[TranscriptVault] visual capture failed:', err);
    visualCaptureStatus.textContent = FAILURE_MESSAGES[err.message] || 'Could not capture the current video frame.';
  }
});

captureBtn.addEventListener('click', async () => {
  captureStatusEl.textContent = 'Checking for an existing note…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/^https:\/\/www\.youtube\.com\/watch/.test(tab.url)) {
      captureStatusEl.textContent = FAILURE_MESSAGES.not_youtube;
      return;
    }

    const videoId = new URL(tab.url).searchParams.get('v');
    const existing = await findNoteByVideoId(vaultRootHandle, videoId);
    if (existing) {
      const titleMatch = existing.content.match(/^title: \"((?:\\\\.|[^\"])*)\"/m);
      currentNote = { topic: existing.topic, filename: existing.filename, videoId };
      lastCapture = {
        videoId,
        title: titleMatch ? titleMatch[1].replace(/\\\\([\"\\\\])/g, '$1') : existing.filename.replace(/\\.md$/, ''),
        visuals: [...existing.content.matchAll(/### \[([^\]]+)\]\(https:\/\/www\.youtube\.com\/watch\?v=[^&]+&t=(\d+)s\)\s*!\[Visual capture at [^\]]+\]\(([^)]+)\)/g)].map(m => ({ startSeconds: Number(m[2]), filename: m[3] })),
      };
      topicInput.value = existing.topic;
      topicInput.disabled = true;
      previewTitleEl.textContent = lastCapture.title;
      previewMetaEl.textContent = 'Existing note found — resuming your previous session.';
      previewArea.hidden = false;
      visualCaptureBtn.disabled = false;
      visualCaptureStatus.textContent = 'Resumed. New visual moments are saved automatically.';
      renderVisualList();
      captureStatusEl.textContent = 'Resumed existing note; transcript was not recaptured.';
      return;
    }
    currentNote = null;
    lastCapture = null;
    const chosenTopic = topicInput.value.trim();
    if (!chosenTopic) {
      captureStatusEl.textContent = 'Choose a topic folder first.';
      topicInput.focus();
      return;
    }
    await chrome.storage.local.set({ [LAST_TOPIC_KEY]: chosenTopic });
    topicInput.disabled = false;
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

    const topicHandle = await ensureTopicFolder(vaultRootHandle, chosenTopic);
    const filename = sanitizeFilename(lastCapture.title);
    if (await fileExists(topicHandle, filename)) throw new Error('note_exists_without_video_id');
    await writeMarkdownFile(topicHandle, filename, buildMarkdown({ ...lastCapture, topic: chosenTopic }));
    currentNote = { topic: chosenTopic, filename, videoId: lastCapture.videoId };
    topicInput.disabled = true;
    captureStatusEl.textContent = 'Transcript saved automatically.';
    previewTitleEl.textContent = lastCapture.title;
    const chapterNote = lastCapture.chapters.length > 0 ? `, ${lastCapture.chapters.length} chapters` : '';
    previewMetaEl.textContent = `${lastCapture.channel} — ${cues.length} caption lines${chapterNote}`;
    previewArea.hidden = false;
    visualCaptureBtn.disabled = false;
    visualCaptureStatus.textContent = 'Pause at an important diagram, slide, or drawing. Each capture saves automatically.';
    renderVisualList();
    if (!topicInput.value.trim()) topicInput.focus();
  } catch (err) {
    console.error('[TranscriptVault] captureBtn handler threw:', err);
    captureStatusEl.textContent = FAILURE_MESSAGES[err.message] || FAILURE_MESSAGES.unknown_error;
  }
});

(async function init() {
  vaultRootHandle = await getVaultHandle();
  await refreshVaultUi();
  await resumeExistingNoteForActiveTab();
})();
