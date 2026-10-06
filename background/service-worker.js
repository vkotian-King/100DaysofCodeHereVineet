chrome.runtime.onInstalled.addListener(() => {});

// Handle the toolbar click explicitly instead of using openPanelOnActionClick.
// The user action grants the extension temporary activeTab access to the current tab.
chrome.action.onClicked.addListener((tab) => {
  const windowId = tab && tab.windowId;
  if (typeof windowId === 'number') {
    chrome.sidePanel.open({ windowId }).catch((err) => {
      console.error('[TranscriptVault] could not open side panel:', err);
    });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'open-panel') return;
  const windowId = tab && tab.windowId;
  if (typeof windowId === 'number') {
    chrome.sidePanel.open({ windowId }).catch((err) => {
      console.error('[TranscriptVault] could not open side panel:', err);
    });
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
