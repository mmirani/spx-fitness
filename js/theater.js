/**
 * Watch + Walk — launcher page controller.
 *
 * Opens real youtube.com in its own tab (full site, unrestricted — YouTube
 * blocks any site from framing its homepage, so a normal tab is the only
 * way to get the real thing) and a small floating controls window that can
 * be dragged on top of it.
 */
document.addEventListener('DOMContentLoaded', () => {
  const openYouTubeBtn = document.getElementById('open-youtube-btn');
  const openControlsBtn = document.getElementById('open-controls-btn');

  if (openYouTubeBtn) {
    openYouTubeBtn.addEventListener('click', () => {
      window.open('https://www.youtube.com', '_blank', 'noopener');
    });
  }

  if (openControlsBtn) {
    openControlsBtn.addEventListener('click', () => {
      const width = 360;
      const height = 720;
      const left = Math.max(0, window.screen.availWidth - width - 40);
      const top = Math.max(0, (window.screen.availHeight - height) / 2);
      window.open(
        'float-controls.html',
        'MiraniWalkControls',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );
    });
  }
});
