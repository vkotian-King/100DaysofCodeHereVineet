# YouTube Transcript Vault

A Chrome extension that captures a YouTube video's existing transcript and saves it as a Markdown note into a topic folder on your local disk — building up a personal, browsable "learning vault" over time.

**No AI. No server. No API keys. No token cost.** Captions already exist as text on YouTube; this tool just fetches, formats, and files them. It does not summarize, classify, or transcribe audio.

## What it does

1. Watch a YouTube video that has captions.
2. Click the extension icon (or press `Ctrl+Shift+Y`) to open the side panel.
3. Click **Capture Transcript from Current Tab**.
4. Type or pick a topic folder (autocompletes against folders you've already created).
5. Click **Save to Vault** — a Markdown file is written to `<your vault folder>/<topic>/<video title>.md`.

Each note has a fixed template you fill in yourself:

```
---
title: "..."
channel: "..."
source: https://www.youtube.com/watch?v=...
video_id: ...
captured: 2026-08-14T00:00:00.000Z
topic: ...
---

## Summary

## Key Insights

## Tools / Frameworks Mentioned

## Skills

## Transcript

- [00:00](https://www.youtube.com/watch?v=...&t=0s) ...
- [00:07](https://www.youtube.com/watch?v=...&t=7s) ...
```

Timestamp links jump back into the video at that exact second. Browsing the resulting notes is intentionally left to whatever you already use for Markdown — [Obsidian](https://obsidian.md/), VS Code, or a plain file explorer all work, since these are just folders and `.md` files.

## Install (unpacked — this isn't on the Chrome Web Store)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this repository's folder.
5. Pin the extension icon to your toolbar (optional, recommended).

## First-run setup

1. Click the extension icon to open the side panel.
2. Click **Select Vault Folder** and choose (or create) a folder on disk — this is the root of your learning vault. Point it inside a synced folder (OneDrive, Google Drive desktop, etc.) if you want it to follow you across devices; the extension itself has no cloud component.
3. That's it — topic folders are created inside the vault root automatically as you save your first note into each new topic.

### Re-granting access

Chrome's File System Access API requires re-confirming folder permission after a browser restart, for security reasons — this is a browser limitation, not a bug in this extension. When that happens, the panel shows a **Re-grant Vault Access** button; one click restores access without re-picking the folder.

### Changing the keyboard shortcut

Go to `chrome://extensions/shortcuts` to customize or reassign `Ctrl+Shift+Y`.

## Limitations

- **YouTube only.** Other video platforms are not supported in this version.
- **Requires existing captions.** Videos with no captions (auto-generated or manual) cannot be captured — there is no speech-to-text fallback by design.
- **Depends on YouTube's page internals.** Video metadata and availability are read live from the page's DOM, and the transcript itself is read by opening the on-page "Show transcript" panel and scraping its rendered rows — not by calling YouTube's caption API directly, which now returns empty responses for unauthenticated requests. None of this is a public, documented interface, so a YouTube redesign could break capture without notice. If that happens, open the browser DevTools console on the YouTube tab and look for `[TranscriptVault]` log lines — they identify exactly which step failed.
- **Topic filing is manual.** There is no automatic classification — you choose or type the topic folder every time. This is deliberate: it keeps the tool free of AI/API dependencies and avoids folder-taxonomy drift from automated guesses.
- **Age-restricted, private, or removed videos** cannot be captured.
- **Wait a beat after navigating to a new video before capturing.** Clicking a video from the homepage or a suggested list navigates client-side (no full page reload), and the page can take a couple of seconds to fully update to the new video. Capturing during that window could pick up stale data from the previous video. Once the title/thumbnail has visually updated, it's safe to capture.

## Development

No build step, no dependencies. Pure library functions (`lib/transcriptFormatter.js`, `lib/filenameSanitizer.js`) have unit tests:

```bash
npm test
```

## License

MIT — see [LICENSE](LICENSE).
