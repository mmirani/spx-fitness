/**
 * Watch + Walk — concept view controller.
 *
 * Handles the two things unique to this page: turning a pasted YouTube
 * link into a playable embed, and collapsing the floating control overlay.
 * All treadmill/BLE logic is untouched — app.js drives the same control
 * IDs here as it does on the dashboard.
 *
 * Note: youtube.com's own homepage refuses to be framed (it sends
 * X-Frame-Options / frame-ancestors headers) — that's YouTube's security
 * policy, not something a page can opt around. Individual videos and
 * playlists embed fine via the official player, which is what this does.
 */
document.addEventListener('DOMContentLoaded', () => {
  const videoFrame = document.getElementById('video-frame');
  const videoForm = document.getElementById('video-form');
  const videoInput = document.getElementById('video-url-input');
  const changeBtn = document.getElementById('video-change-btn');

  const placeholderHTML = videoFrame ? videoFrame.innerHTML : '';

  function extractYouTubeRef(raw) {
    const input = raw.trim();

    let m = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (m) return { type: 'playlist', id: m[1] };

    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return { type: 'video', id: input };

    m = input.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) return { type: 'video', id: m[1] };

    m = input.match(/(?:youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (m) return { type: 'video', id: m[1] };

    return null;
  }

  function loadVideo(ref) {
    const src = ref.type === 'playlist'
      ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(ref.id)}&autoplay=1`
      : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ref.id)}?autoplay=1&rel=0`;

    videoFrame.innerHTML = `<iframe src="${src}" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    if (changeBtn) changeBtn.style.display = 'inline-block';
  }

  if (videoForm) {
    videoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const ref = extractYouTubeRef(videoInput.value);
      if (!ref) {
        videoInput.classList.add('input-error');
        videoInput.placeholder = "Couldn't read that link — try a full youtube.com/watch?v=... URL";
        return;
      }
      videoInput.classList.remove('input-error');
      loadVideo(ref);
    });
  }

  if (changeBtn) {
    changeBtn.addEventListener('click', () => {
      videoFrame.innerHTML = placeholderHTML;
      changeBtn.style.display = 'none';
      // Re-bind the form inside the restored placeholder markup.
      const form = document.getElementById('video-form');
      const input = document.getElementById('video-url-input');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const ref = extractYouTubeRef(input.value);
          if (!ref) {
            input.classList.add('input-error');
            input.placeholder = "Couldn't read that link — try a full youtube.com/watch?v=... URL";
            return;
          }
          loadVideo(ref);
        });
      }
    });
  }

  // Floating overlay collapse/expand
  const overlay = document.getElementById('walk-overlay');
  const overlayToggle = document.getElementById('overlay-toggle');
  if (overlay && overlayToggle) {
    overlayToggle.addEventListener('click', () => {
      overlay.classList.toggle('collapsed');
    });
  }
});
