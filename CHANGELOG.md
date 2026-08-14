# Changelog

## Unreleased

### Added
- **Chapters and description capture.** Alongside the transcript, a capture now also reads the video's description and parses any creator-authored chapter list from it (the same `0:00 Intro` / `2:15 Section 2` convention YouTube's own scrub-bar chapters are built from). These are captured facts — like the transcript itself — not authored insight, so they don't affect whether a note is "publish-ready." Chapters render as timestamp-linked list items; the description is preserved verbatim in a fenced code block so the creator's original line breaks survive.

### Changed
- **Simplified the capture template to transcript-only.** Notes no longer get empty `## Summary` / `## Key Insights` / `## Tools / Frameworks Mentioned` / `## Skills` placeholders at capture time — just front matter and the transcript. Any further structure is added later, by hand or by a future on-demand analysis step, rather than baked into every file up front. `lib/vaultNoteParser.js` and the publish renderer still understand those sections whenever they're present, so nothing breaks for notes that already have them.
- Added `lib/vaultNoteParser.js` (parses a saved note's Markdown back into structured fields) and `lib/siteGenerator.js` (renders parsed notes into a small static site — index/topic/note pages, a hand-written markdown-subset renderer for user-added sections, and an attribution footer) as groundwork for the publish-to-GitHub-Pages feature.
- Added `scripts/generate-preview-site.js`, a dev-only tool for rendering a real vault folder into local HTML to sanity-check output before wiring up real publishing.

### Fixed
- **Description capture picked up the whole expandable panel, not just the description.** Reading the container's full text bled in an "Ask" AI widget, a duplicate chapters list, a transcript entry point, the channel info card, and YouTube's own expand/collapse button labels. Now scoped to the specific `#expanded`/`#snippet` child element that holds just the creator's own text, with trailing "Speaker: / Products Mentioned:" metadata lines (present on auto-dubbed videos) trimmed off the end.
- **Chapter titles kept a leading "- " when a creator wrote chapters as `0:00 - Title` rather than `0:00 Title`.** Both conventions are now handled.
- **Stale data after clicking a new video.** YouTube's client-side navigation (clicking a video from the homepage or a suggested-videos list) doesn't reload the page, so the internal `ytInitialPlayerResponse` variable the extension previously relied on for the video's title/channel/availability was left empty or pointing at whatever video loaded first. This could surface as "Could not read this page" on a perfectly valid video, or — worse — a capture silently returning the *previous* video's transcript. Metadata and availability are now read live from the page's DOM instead, which YouTube does keep in sync on every navigation.
- **Duplicate transcript on save.** The transcript panel's segments were queried across the whole page, and YouTube can render a second, hidden copy of the same segments elsewhere (e.g. under a "structured description" panel), so every line was being captured twice. The segment query is now scoped to the actual expanded transcript panel, plus a de-duplication pass as a safety net.
- **Leftover transcript from the previous video.** If a transcript panel was left open when navigating to a different video, its segments could still be showing the old video's captions at the moment of capture. The panel is now force-closed and reopened fresh on every capture.

## 0.1.0 — Initial release
- Chrome extension (Manifest V3) that captures a YouTube video's on-page transcript into a Markdown note.
- Local vault folder selection and topic-folder autocomplete via the File System Access API — no AI, no server, no API keys.
- Fixed note template (Summary / Key Insights / Tools / Skills / Transcript) with timestamped links back into the video.
