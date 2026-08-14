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
