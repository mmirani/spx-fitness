/**
 * Watch + Walk — launcher page controller.
 *
 * One click does two things, in this order:
 *  1. Moves the walking-control markup (#pip-source) into a real Document
 *     Picture-in-Picture window, which the browser keeps floating above
 *     every other window — including the YouTube tab — automatically.
 *     A plain window.open() popup can't do this: it has normal window
 *     stacking, so it falls behind as soon as you click into another
 *     window. PiP is the only web API that gives genuine always-on-top
 *     behavior, which is why this needs Chrome/Edge (same browsers the
 *     Settings tab already requires for Web Bluetooth).
 *  2. Opens real youtube.com in a new tab (a plain window.open with no
 *     feature string, so it behaves like a normal tab, not a popup).
 *
 * PiP is requested BEFORE the YouTube tab is opened on purpose: opening a
 * new tab shifts browser focus away immediately, and some browsers refuse
 * a Picture-in-Picture request once the requesting page has already lost
 * focus/visibility.
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

  function setHint(text) {
    if (launcherHint) launcherHint.textContent = text;
  }

  function fallbackPopup(reason) {
    window.open('float-controls.html', 'MiraniWalkControls', 'width=360,height=720,resizable=yes,scrollbars=yes');
    setHint(
      `Always-on-top mode didn’t work here (${reason}), so the controls opened as a ` +
      `regular window instead — you’ll need to click it to bring it back in front of YouTube.`
    );
  }

  // Returns true once the controls are actually floating in a real PiP
  // window; false if it fell back to a regular (non-always-on-top) popup.
  async function openFloatingControls() {
    if (pipWindow) {
      pipWindow.focus();
      return true;
    }

    if (!pipSupported) {
      // Fallback for non-Chromium browsers, or Chrome/Edge older than 116
      // (Document Picture-in-Picture's minimum version). Works, but won't
      // stay on top once you click into another window.
      fallbackPopup('this browser doesn’t support always-on-top windows');
      return false;
    }

    try {
      pipWindow = await documentPictureInPicture.requestWindow({ width: 360, height: 640 });
    } catch (err) {
      // Shown on-page (not just logged) so this is diagnosable without
      // opening DevTools — the exact reason from the browser tells us
      // whether this is an activation issue, a policy block, etc.
      console.warn('Picture-in-Picture request failed, falling back to a regular popup:', err);
      fallbackPopup(`${err.name}: ${err.message}`);
      return false;
    }

    cloneStylesInto(pipWindow.document);
    pipWindow.document.body.classList.add('float-body');
    pipWindow.document.body.appendChild(pipSource);
    pipSource.hidden = false;
    window.__spxPipDocument = pipWindow.document;
    setHint('Floating above every window now — including YouTube — until you close it.');

    pipWindow.addEventListener('pagehide', () => {
      pipSource.hidden = true;
      if (homeParent) homeParent.appendChild(pipSource);
      window.__spxPipDocument = null;
      pipWindow = null;
      if (startBtn) startBtn.textContent = 'Start Watch + Walk';
      setHint('Your walking controls will float in a small always-on-top window; YouTube opens beside it in a new tab.');
    });

    return true;
  }

  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      // Request the floating window FIRST, while this page still has
      // focus — opening the YouTube tab moves focus away immediately,
      // and Picture-in-Picture can refuse to activate on a page that has
      // already lost focus/visibility by the time the request resolves.
      const floated = await openFloatingControls();
      window.open('https://www.youtube.com', '_blank');
      if (floated) startBtn.textContent = 'Reopen Floating Controls';
    });
  }
});
