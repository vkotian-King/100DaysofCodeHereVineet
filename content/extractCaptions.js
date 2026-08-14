(async function extractCaptions() {
  function readPlayerResponse() {
    if (window.ytInitialPlayerResponse) return window.ytInitialPlayerResponse;

    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch (_err) {
          // try next script tag
        }
      }
    }
    return null;
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
    const playerResponse = readPlayerResponse();
    if (!playerResponse) {
      console.error('[TranscriptVault] no ytInitialPlayerResponse found on page');
      return { ok: false, reason: 'no_player_response' };
    }

    const playabilityStatus = playerResponse.playabilityStatus && playerResponse.playabilityStatus.status;
    if (playabilityStatus && playabilityStatus !== 'OK') {
      console.error('[TranscriptVault] playabilityStatus:', playabilityStatus);
      return { ok: false, reason: 'unavailable' };
    }

    const videoDetails = playerResponse.videoDetails || {};
    const videoId = videoDetails.videoId || new URL(window.location.href).searchParams.get('v') || '';
    const title = videoDetails.title || document.title || 'Untitled video';
    const channel = videoDetails.author || '';
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    const btn = findShowTranscriptButton();
    if (!btn) {
      console.error('[TranscriptVault] no "Show transcript" button found on page');
      return { ok: false, reason: 'no_captions' };
    }

    const wasAlreadyOpen = isTranscriptPanelExpanded();
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

    if (!wasAlreadyOpen) {
      const closeBtn = findCloseTranscriptButton();
      if (closeBtn) {
        try { closeBtn.click(); } catch (_err) { /* best-effort cleanup, ignore */ }
      }
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
    };
  } catch (err) {
    console.error('[TranscriptVault] unexpected error:', err);
    return { ok: false, reason: 'unknown_error' };
  }
})();
