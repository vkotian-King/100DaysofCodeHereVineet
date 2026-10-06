(function extractVisualFrame() {
  const video = document.querySelector('video');
  if (!video) return { ok: false, reason: 'no_video' };

  const rect = video.getBoundingClientRect();
  if (!rect.width || !rect.height) return { ok: false, reason: 'video_not_visible' };

  return {
    ok: true,
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
})();
