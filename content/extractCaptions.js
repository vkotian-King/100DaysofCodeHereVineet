(async function extractCaptions() {
  // window.ytInitialPlayerResponse is only injected on a genuine full page load. Clicking a
  // video from the homepage/sidebar navigates client-side (SPA) without a reload, and that
  // global is never (re)populated — it stays undefined or stale from whatever page loaded
  // first. So metadata and availability must come from live DOM, which YouTube's router does
  // keep in sync on every navigation.
  function getVideoIdFromUrl() {
    try {
      return new URL(window.location.href).searchParams.get('v') || '';
    } catch (_err) {
      return '';
    }
  }

  function getTitle() {
    const h1 = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.ytd-watch-metadata');
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    const fallback = (document.title || '').replace(/\s*-\s*YouTube\s*$/, '').trim();
    return fallback || 'Untitled video';
  }

  function getChannel() {
    const el = document.querySelector(
      'ytd-channel-name a, #channel-name a, ytd-video-owner-renderer ytd-channel-name a'
    );
    return el ? el.textContent.trim() : '';
  }

  function getDescriptionText() {
    const container = document.querySelector('#description-inline-expander, ytd-text-inline-expander#description-inline-expander');
    if (!container) return '';

    const expandBtn = container.querySelector('tp-yt-paper-button#expand') ||
      Array.from(container.querySelectorAll('tp-yt-paper-button, button'))
        .find((b) => /more/i.test((b.textContent || '').trim()));
    if (expandBtn) {
      try { expandBtn.click(); } catch (_err) { /* ignore, fall back to whatever text is visible */ }
    }

    // Reading the whole container picks up sibling widgets bundled into the same
    // module (an "Ask" panel, a duplicate chapters list, a transcript entry point,
    // the channel info card) — #expanded (or #snippet before expansion) is scoped
    // to just the creator's own text.
    const textEl = container.querySelector('#expanded') || container.querySelector('#snippet');
    const rawText = (textEl ? textEl.innerText : container.innerText) || '';

    // That element still carries YouTube's own trailing metadata (auto-dub
    // attribution, product tags) appended after the real description — strip
    // trailing lines matching that known "Key: value" shape.
    const trailingMetadataRe = /^(Speaker|Products Mentioned):\s/;
    const lines = rawText.trim().split('\n');
    while (lines.length > 0) {
      const last = lines[lines.length - 1].trim();
      if (last === '' || trailingMetadataRe.test(last)) {
        lines.pop();
      } else {
        break;
      }
    }

    return lines.join('\n').trim();
  }

  function parseChaptersFromDescription(descriptionText) {
    if (!descriptionText) return [];
    const chapterLineRe = /^(\d{1,2}(?::\d{2}){1,2})\s+(.+)$/;
    const chapters = [];

    for (const line of descriptionText.split('\n')) {
      const match = line.trim().match(chapterLineRe);
      if (match) {
        // Creators write chapter titles either as "0:00 Title" or "0:00 - Title" —
        // strip a leading "- " separator so it doesn't end up baked into the title.
        const title = match[2].trim().replace(/^-\s*/, '');
        chapters.push({ startSeconds: parseTimestampToSeconds(match[1]), title });
      }
    }

    return chapters;
  }

  function isVideoUnavailable() {
    if (document.querySelector('ytd-player-error-message-renderer')) return true;
    const bodyText = (document.body.innerText || '').slice(0, 2000);
    return /video (isn't|is not) available|video has been removed|this video is private|sign in to confirm your age/i.test(bodyText);
  }

  function findShowTranscriptButton() {
    const byAria = document.querySelector('button[aria-label="Show transcript"]');
    if (byAria) return byAria;
    return Array.from(document.querySelectorAll('button'))
      .find((b) => (b.textContent || '').trim() === 'Show transcript') || null;
  }

  function findCloseTranscriptButton() {
    return document.querySelector('button[aria-label="Close transcript"]');
  }

  function findTranscriptPanels() {
    return Array.from(document.querySelectorAll('ytd-engagement-panel-section-list-renderer'))
      .filter((p) => /transcript/i.test(p.getAttribute('target-id') || ''));
  }

  function isTranscriptPanelExpanded() {
    return findTranscriptPanels().some((p) => p.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  }

  function findSegmentElements() {
    // Scope to the expanded transcript panel only — YouTube can render a second,
    // hidden/preview copy of the same segments elsewhere in the page (e.g. under the
    // structured description panel), and an unscoped document-wide query picks up both.
    const expandedPanels = findTranscriptPanels()
      .filter((p) => p.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    const searchRoots = expandedPanels.length > 0 ? expandedPanels : [document];

    for (const root of searchRoots) {
      const modern = root.querySelectorAll('transcript-segment-view-model');
      if (modern.length > 0) return Array.from(modern);
    }
    for (const root of searchRoots) {
      const legacy = root.querySelectorAll('ytd-transcript-segment-renderer');
      if (legacy.length > 0) return Array.from(legacy);
    }
    return [];
  }

  function dedupeCues(cues) {
    const seen = new Set();
    const result = [];
    for (const cue of cues) {
      const key = `${cue.startSeconds}|${cue.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(cue);
    }
    return result;
  }

  function parseTimestampToSeconds(ts) {
    const parts = ts.split(':').map((p) => Number(p.trim()));
    if (parts.length === 0 || parts.some((p) => Number.isNaN(p))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }

  function extractSegment(seg) {
    const timestampEl = seg.querySelector('[class*="Timestamp"]:not([class*="A11y"])') ||
      seg.querySelector('.segment-timestamp');
    let timestampText = timestampEl ? timestampEl.textContent.trim() : '';

    const textEl = seg.querySelector('span[role="text"]') || seg.querySelector('.segment-text');
    let text = textEl ? textEl.textContent.trim() : '';

    if (!timestampText || !text) {
      const lines = (seg.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
      if (!timestampText) {
        timestampText = lines.find((l) => /^\d{1,2}(:\d{2}){1,2}$/.test(l)) || '';
      }
      if (!text) {
        text = lines
          .filter((l) => l !== timestampText && !/^\d+\s+(second|minute|hour)s?$/i.test(l))
          .join(' ');
      }
    }

    return { startSeconds: parseTimestampToSeconds(timestampText), text: text.trim() };
  }

  function waitFor(conditionFn, timeoutMs, intervalMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const result = conditionFn();
        if (result) {
          resolve(result);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  try {
    const videoId = getVideoIdFromUrl();
    if (!videoId) {
      console.error('[TranscriptVault] could not determine a video id from the URL');
      return { ok: false, reason: 'no_player_response' };
    }

    if (isVideoUnavailable()) {
      console.error('[TranscriptVault] video appears unavailable (DOM error state detected)');
      return { ok: false, reason: 'unavailable' };
    }

    const title = getTitle();
    const channel = getChannel();
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const description = getDescriptionText();
    const chapters = parseChaptersFromDescription(description);

    const btn = findShowTranscriptButton();
    if (!btn) {
      console.error('[TranscriptVault] no "Show transcript" button found on page');
      return { ok: false, reason: 'no_captions' };
    }

    // Force a fresh open every time. If a transcript panel was left expanded from a
    // previously viewed video (common after in-page/SPA navigation), its segments can be
    // stale leftovers rather than this video's — closing it first makes the click below
    // re-render fresh for the video we're actually on.
    if (isTranscriptPanelExpanded()) {
      const preCloseBtn = findCloseTranscriptButton();
      if (preCloseBtn) {
        try { preCloseBtn.click(); } catch (_err) { /* ignore */ }
        await sleep(200);
      }
    }

    btn.click();

    const segs = await waitFor(() => {
      const found = findSegmentElements();
      return found.length > 0 ? found : null;
    }, 6000, 250);

    if (!segs) {
      console.error('[TranscriptVault] transcript panel opened but no segments appeared within timeout');
      return { ok: false, reason: 'no_captions' };
    }

    await sleep(300); // let any late-rendering segments settle
    const finalSegs = findSegmentElements();
    const cues = dedupeCues(finalSegs.map(extractSegment).filter((c) => c.text));

    const closeBtn = findCloseTranscriptButton();
    if (closeBtn) {
      try { closeBtn.click(); } catch (_err) { /* best-effort cleanup, ignore */ }
    }

    if (cues.length === 0) {
      console.error('[TranscriptVault] transcript panel had segment elements but none yielded text', finalSegs.length);
      return { ok: false, reason: 'no_captions' };
    }

    return {
      ok: true,
      title,
      channel,
      videoId,
      url,
      captureDate: new Date().toISOString(),
      cues,
      description,
      chapters,
    };
  } catch (err) {
    console.error('[TranscriptVault] unexpected error:', err);
    return { ok: false, reason: 'unknown_error' };
  }
})();
