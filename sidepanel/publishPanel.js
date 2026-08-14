import { listTopicFolders, readAllVaultNotes, readPinnedTopics, writePinnedTopics } from '../lib/fsOps.js';
import { sortTopicsWithPinned, buildSiteFiles, DEFAULT_TOOL_URL } from '../lib/siteGenerator.js';
import { testConnection, publishAll } from '../lib/githubPublisher.js';
import { getPublishSettings, setPublishSettings } from '../lib/publishSettingsStorage.js';

const togglePublishBtn = document.getElementById('togglePublishBtn');
const publishBody = document.getElementById('publishBody');
const topicPinListEl = document.getElementById('topicPinList');
const repoOwnerInput = document.getElementById('repoOwnerInput');
const repoNameInput = document.getElementById('repoNameInput');
const patInput = document.getElementById('patInput');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const connectionStatusEl = document.getElementById('connectionStatus');
const publishBtn = document.getElementById('publishBtn');
const publishProgressEl = document.getElementById('publishProgress');
const publishResultEl = document.getElementById('publishResult');

let vaultRootHandle = null;
let pinnedNames = [];
let allTopicNames = [];
let initialized = false;

function setStatus(el, message, kind) {
  el.textContent = message;
  el.className = kind || '';
}

async function loadSettingsIntoInputs() {
  const settings = await getPublishSettings();
  repoOwnerInput.value = settings.owner || '';
  repoNameInput.value = settings.repo || '';
  patInput.value = settings.pat || '';
}

async function saveSettingsFromInputs() {
  await setPublishSettings({
    owner: repoOwnerInput.value.trim(),
    repo: repoNameInput.value.trim(),
    pat: patInput.value,
  });
}

function renderTopicPinList() {
  topicPinListEl.innerHTML = '';

  if (allTopicNames.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No topics yet — capture a video and pick a topic to create one.';
    topicPinListEl.appendChild(li);
    return;
  }

  const ordered = sortTopicsWithPinned(allTopicNames.map((name) => ({ name })), pinnedNames);
  const pinnedOrder = ordered.filter((t) => t.pinned).map((t) => t.name);

  ordered.forEach((topic) => {
    const li = document.createElement('li');
    li.className = 'pin-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = topic.pinned ? 'topic-name pinned' : 'topic-name';
    nameSpan.textContent = topic.name;
    li.appendChild(nameSpan);

    if (topic.pinned) {
      const posInPinned = pinnedOrder.indexOf(topic.name);

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.textContent = '↑';
      upBtn.title = 'Move up';
      upBtn.disabled = posInPinned === 0;
      upBtn.addEventListener('click', () => movePinned(topic.name, -1));
      li.appendChild(upBtn);

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.textContent = '↓';
      downBtn.title = 'Move down';
      downBtn.disabled = posInPinned === pinnedOrder.length - 1;
      downBtn.addEventListener('click', () => movePinned(topic.name, 1));
      li.appendChild(downBtn);
    }

    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.textContent = topic.pinned ? 'Unpin' : 'Pin';
    pinBtn.addEventListener('click', () => togglePin(topic.name));
    li.appendChild(pinBtn);

    topicPinListEl.appendChild(li);
  });
}

async function persistPinsAndRerender() {
  try {
    await writePinnedTopics(vaultRootHandle, pinnedNames);
  } catch (_err) {
    // best-effort — the in-memory order still renders even if the write failed
  }
  renderTopicPinList();
}

function togglePin(name) {
  const idx = pinnedNames.findIndex((n) => n.toLowerCase() === name.toLowerCase());
  if (idx === -1) {
    pinnedNames.push(name);
  } else {
    pinnedNames.splice(idx, 1);
  }
  persistPinsAndRerender();
}

function movePinned(name, delta) {
  const idx = pinnedNames.findIndex((n) => n.toLowerCase() === name.toLowerCase());
  if (idx === -1) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= pinnedNames.length) return;
  const [item] = pinnedNames.splice(idx, 1);
  pinnedNames.splice(newIdx, 0, item);
  persistPinsAndRerender();
}

async function refreshTopicPinList() {
  allTopicNames = await listTopicFolders(vaultRootHandle);
  pinnedNames = await readPinnedTopics(vaultRootHandle);
  renderTopicPinList();
}

async function onTestConnection() {
  const pat = patInput.value.trim();
  if (!pat) {
    setStatus(connectionStatusEl, 'Enter a token first.', 'error');
    return;
  }

  setStatus(connectionStatusEl, 'Checking…', '');
  const result = await testConnection({ pat });
  if (result.ok) {
    setStatus(connectionStatusEl, `Connected as ${result.login}.`, 'success');
  } else {
    setStatus(connectionStatusEl, result.message, 'error');
  }
}

async function onPublish() {
  const owner = repoOwnerInput.value.trim();
  const repo = repoNameInput.value.trim();
  const pat = patInput.value.trim();

  if (!owner || !repo || !pat) {
    setStatus(publishResultEl, 'Fill in owner, repository name, and token first.', 'error');
    return;
  }

  publishBtn.disabled = true;
  publishProgressEl.innerHTML = '';
  setStatus(publishResultEl, '', '');

  try {
    const topicsRaw = await readAllVaultNotes(vaultRootHandle);
    const files = buildSiteFiles(topicsRaw, {
      toolUrl: DEFAULT_TOOL_URL,
      siteTitle: 'My learning journal',
      pinnedTopics: pinnedNames,
    });

    const results = await publishAll(files, {
      owner,
      repo,
      pat,
      onProgress: ({ path, status }) => {
        const line = document.createElement('div');
        line.textContent = `${path}: ${status}`;
        if (status === 'error') line.className = 'error';
        publishProgressEl.appendChild(line);
      },
    });

    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) {
      setStatus(publishResultEl, `Published! https://${owner}.github.io/${repo}/`, 'success');
    } else {
      const firstMessage = (failed[0].error && failed[0].error.message) || 'unknown error';
      setStatus(publishResultEl, `${failed.length} of ${results.length} files failed: ${firstMessage}`, 'error');
    }
  } catch (err) {
    console.error('[TranscriptVault] publish failed:', err);
    setStatus(publishResultEl, 'Could not read your vault. Try again.', 'error');
  } finally {
    publishBtn.disabled = false;
  }
}

function wireStaticListeners() {
  togglePublishBtn.addEventListener('click', () => {
    publishBody.hidden = !publishBody.hidden;
    togglePublishBtn.textContent = publishBody.hidden ? 'Publish ▾' : 'Publish ▴';
  });

  [repoOwnerInput, repoNameInput, patInput].forEach((input) => {
    input.addEventListener('change', saveSettingsFromInputs);
  });

  testConnectionBtn.addEventListener('click', onTestConnection);
  publishBtn.addEventListener('click', onPublish);
}

async function refreshPublishPanel(vaultHandle) {
  vaultRootHandle = vaultHandle;
  if (!initialized) {
    wireStaticListeners();
    await loadSettingsIntoInputs();
    initialized = true;
  }
  await refreshTopicPinList();
}

export { refreshPublishPanel };
