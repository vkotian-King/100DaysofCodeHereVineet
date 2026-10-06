chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'open-panel') return;
  const windowId = tab && tab.windowId;
  if (typeof windowId === 'number') {
    chrome.sidePanel.open({ windowId }).catch(() => {});
  }
});


chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'capture-visible-tab') return;

  (async () => {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(message.windowId, { format: 'png' });
      sendResponse({ ok: true, dataUrl });
    } catch (err) {
      console.error('[TranscriptVault] service worker captureVisibleTab failed:', err);
      sendResponse({ ok: false, error: err?.message || 'capture_failed' });
    }
  })();

  return true;
});
