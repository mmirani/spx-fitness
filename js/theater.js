/**
 * Watch + Walk — launcher page controller.
 *
 * One click does two things:
 *  1. Opens real youtube.com in a new tab (a plain window.open with no
 *     feature string, so it behaves like a normal tab, not a popup).
 *  2. Moves the walking-control markup (#pip-source) into a real Document
 *     Picture-in-Picture window, which the browser keeps floating above
 *     every other window — including the YouTube tab — automatically.
 *     A plain window.open() popup can't do this: it has normal window
 *     stacking, so it falls behind as soon as you click into another
 *     window. PiP is the only web API that gives genuine always-on-top
 *     behavior, which is why this needs Chrome/Edge (same browsers the
 *     Settings tab already requires for Web Bluetooth).
 *
 * Both need a direct click to fire — browsers refuse to open new windows
 * or PiP surfaces without one, specifically so pages can't do it on their
 * own without you asking.
 */
document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  const launcherHint = document.getElementById('launcher-hint');
  const pipSource = document.getElementById('pip-source');
  const homeParent = pipSource ? pipSource.parentElement : null;

  const pipSupported = 'documentPictureInPicture' in window;
  let pipWindow = null;

  function cloneStylesInto(doc) {
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        if (sheet.href) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = sheet.href;
          doc.head.appendChild(link);
        } else if (sheet.ownerNode && sheet.ownerNode.tagName === 'STYLE') {
          doc.head.appendChild(sheet.ownerNode.cloneNode(true));
        }
      } catch (e) {
        // Cross-origin stylesheet (e.g. the Google Fonts import) — the
        // @import inside style.css still loads normally in the new
        // document, this just skips trying to read it as a CSSOM object.
      }
    });
  }

  async function openFloatingControls() {
    if (pipWindow) {
      pipWindow.focus();
      return;
    }

    if (!pipSupported) {
      // Fallback for non-Chromium browsers: a normal popup. It works, but
      // won't stay on top once you click into another window — that part
      // of the feature genuinely needs Picture-in-Picture support.
      window.open('float-controls.html', 'MiraniWalkControls', 'width=360,height=720,resizable=yes,scrollbars=yes');
      return;
    }

    try {
      pipWindow = await documentPictureInPicture.requestWindow({ width: 360, height: 640 });
    } catch (err) {
      console.warn('Picture-in-Picture request failed, falling back to a regular popup:', err);
      window.open('float-controls.html', 'MiraniWalkControls', 'width=360,height=720,resizable=yes,scrollbars=yes');
      return;
    }

    cloneStylesInto(pipWindow.document);
    pipWindow.document.body.classList.add('float-body');
    pipWindow.document.body.appendChild(pipSource);
    pipSource.hidden = false;
    window.__spxPipDocument = pipWindow.document;

    pipWindow.addEventListener('pagehide', () => {
      pipSource.hidden = true;
      if (homeParent) homeParent.appendChild(pipSource);
      window.__spxPipDocument = null;
      pipWindow = null;
      if (startBtn) startBtn.textContent = 'Start Watch + Walk';
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      window.open('https://www.youtube.com', '_blank');
      openFloatingControls();
      startBtn.textContent = 'Reopen Floating Controls';
    });
  }

  if (!pipSupported && launcherHint) {
    launcherHint.textContent = 'Your browser doesn’t support always-on-top windows, so the controls will open as a regular popup instead — you may need to bring it back to front manually.';
  }
});
