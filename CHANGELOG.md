# Changelog

## Unreleased

### Fixed
- **Stale data after clicking a new video.** YouTube's client-side navigation (clicking a video from the homepage or a suggested-videos list) doesn't reload the page, so the internal `ytInitialPlayerResponse` variable the extension previously relied on for the video's title/channel/availability was left empty or pointing at whatever video loaded first. This could surface as "Could not read this page" on a perfectly valid video, or — worse — a capture silently returning the *previous* video's transcript. Metadata and availability are now read live from the page's DOM instead, which YouTube does keep in sync on every navigation.
- **Duplicate transcript on save.** The transcript panel's segments were queried across the whole page, and YouTube can render a second, hidden copy of the same segments elsewhere (e.g. under a "structured description" panel), so every line was being captured twice. The segment query is now scoped to the actual expanded transcript panel, plus a de-duplication pass as a safety net.
- **Leftover transcript from the previous video.** If a transcript panel was left open when navigating to a different video, its segments could still be showing the old video's captions at the moment of capture. The panel is now force-closed and reopened fresh on every capture.

## 0.1.0 — Initial release
- Chrome extension (Manifest V3) that captures a YouTube video's on-page transcript into a Markdown note.
- Local vault folder selection and topic-folder autocomplete via the File System Access API — no AI, no server, no API keys.
- Fixed note template (Summary / Key Insights / Tools / Skills / Transcript) with timestamped links back into the video.
