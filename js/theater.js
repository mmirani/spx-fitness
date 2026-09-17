/**
 * Watch + Walk — launcher page controller.
 *
 * "Open YouTube" is a plain <a target="_blank"> in the HTML — that's the
 * reliable way to get a real new tab. (window.open() with any feature
 * string, even just 'noopener', gets treated as a popup request by some
 * browsers instead of a tab.) This script only handles the one thing that
 * *should* be a popup: the small floating controls window.
 */
document.addEventListener('DOMContentLoaded', () => {
  const openControlsBtn = document.getElementById('open-controls-btn');

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
