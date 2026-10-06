# YouTube Transcript Vault

A Chrome extension that captures a YouTube video's existing transcript and saves it as a Markdown note into a topic folder on your local disk — building up a personal, browsable "learning vault" over time.

**No AI. No server. No API keys. No token cost.** Captions already exist as text on YouTube; this tool just fetches, formats, and files them. It does not summarize, classify, or transcribe audio.

## What it does

1. Watch a YouTube video that has captions.
2. Click the extension icon (or press `Ctrl+Shift+Y`) to open the side panel.
3. Click **Capture Transcript from Current Tab**.
4. Type or pick a topic folder (autocompletes against folders you've already created).
5. Click **Save to Vault** — a Markdown file is written to `<your vault folder>/<topic>/<video title>.md`.

Each note is a plain transcript capture — no empty template sections to skip past:

```
---
title: "..."
channel: "..."
source: https://www.youtube.com/watch?v=...
video_id: ...
captured: 2026-08-14T00:00:00.000Z
topic: ...
---

## Chapters

- [00:00](https://www.youtube.com/watch?v=...&t=0s) Intro
- [02:15](https://www.youtube.com/watch?v=...&t=135s) Section 2

## Description

​```
The video's description, verbatim.
​```

## Transcript

- [00:00](https://www.youtube.com/watch?v=...&t=0s) ...
- [00:07](https://www.youtube.com/watch?v=...&t=7s) ...
```

Chapters and Description are only included when present — a video with no creator-authored chapters just won't have that section. Both are captured automatically, the same way the transcript is: they're facts already sitting on the page, not analysis. Timestamp links jump back into the video at that exact second. Browsing the resulting notes is intentionally left to whatever you already use for Markdown — [Obsidian](https://obsidian.md/), VS Code, or a plain file explorer all work, since these are just folders and `.md` files.

Any further structure — a summary, key insights, tools mentioned — is deliberately *not* generated at capture time. Add it yourself later if and when a video is worth revisiting, or layer an on-demand analysis step on top of the captured transcript when you actually want one; nothing is forced into every file up front. `lib/vaultNoteParser.js` already understands notes that have gained extra `##` sections this way, so nothing about the format needs to change if you add them by hand.

## Capturing visual moments

After capturing a transcript, the preview includes **📸 Capture Current Frame**. Pause the YouTube video at an important diagram, slide, or drawing and capture it. You can capture multiple moments from the same video before saving.

Each visual is stored as a PNG beside the Markdown note and referenced from a **Visual Moments** section with a timestamp link back to YouTube:

```
Topic/
  Video Title.md
  visual-03-39-01.png
  visual-06-42-02.png
```

V1 captures the visible YouTube player by taking a screenshot of the tab and cropping it to the video element. It does not attempt to access the underlying YouTube media stream.

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

## Publishing your vault as a website

Expanding **Publish** in the side panel turns your vault into a small static site (an index page, one page per topic, one page per note — including chapters/description/transcript) and pushes it straight to a GitHub repo you control, hosted for free on GitHub Pages. No AI, no server we run — the extension talks directly to GitHub's API using a token you create.

**One-time setup, done manually in GitHub's own UI (not from the extension):**
1. Create a new, empty **public** repository on GitHub.
2. In that repo's **Settings → Pages**, set the source to the `main` branch, root folder, and save.
3. Go to **github.com/settings/personal-access-tokens** and create a **fine-grained** token scoped to **only this repository**, with **Contents: Read and write** permission (nothing broader). Fine-grained tokens require an expiration date — pick whatever you're comfortable with, and you'll need to regenerate it once it expires.

**In the side panel:**
1. Expand **Publish**. The topic list here is also where you **pin** topics — click **Pin** on any topic to float it to the top of your published site's homepage, and use the ↑/↓ buttons to reorder multiple pinned topics. This is saved to a `pinned-topics.json` file at your vault's root.
2. Fill in the repo **Owner** (your GitHub username or org) and **Repository name**, and paste your **Personal Access Token**.
3. Click **Test Connection** to confirm the token works before publishing.
4. Click **Publish**. Progress is shown per file; when it finishes you'll get your site's URL (`https://<owner>.github.io/<repo>/`), which can take a minute to resolve the very first time.

**Known limitations of this feature:**
- If you rename or delete a note locally, its old page on GitHub isn't automatically deleted — re-publishing updates/adds pages but doesn't clean up orphaned ones yet.
- Every note is published, whether or not you've added any Summary/Key Insights of your own — a transcript-only note is still just a transcript on the public page. Nothing currently gates low-value pages out of a publish; that's on you to curate for now (fill in a note, or don't publish that topic).
- Rate limits and auth failures stop the whole run rather than skipping past them, so a bad token or a GitHub rate limit means retrying after fixing the underlying issue, not a partial publish.

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
