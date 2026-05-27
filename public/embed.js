/*
 * WaiNui embed helper — include this once in your site's footer:
 *   <script src="https://wainui-photo-uploader.vercel.app/embed.js"></script>
 *
 * It listens for height messages from any embedded WaiNui iframe and resizes
 * that iframe to fit its content, so the gallery/upload frame never scrolls
 * internally or gets cut off. Works for any number of WaiNui iframes on a page.
 */
(function () {
  var APP_HOST = 'wainui-photo-uploader.vercel.app';

  function applyHeight(f, h) {
    // Use !important so it beats any theme CSS that constrains iframe height.
    f.style.setProperty('height', h + 'px', 'important');
    f.setAttribute('scrolling', 'no');
  }

  function onMessage(e) {
    var data = e && e.data;
    if (!data || data.type !== 'wainui-height' || !data.height) return;
    var frames = document.querySelectorAll('iframe[src*="' + APP_HOST + '"]');
    if (!frames.length) return;
    var matched = false;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        applyHeight(frames[i], data.height);
        matched = true;
      }
    }
    // Fallback: some mobile browsers don't expose a matchable message source.
    // If nothing matched and there's only one app frame on the page, resize it.
    if (!matched && frames.length === 1) {
      applyHeight(frames[0], data.height);
    }
  }

  // Ask each app frame to report its height. This is the key to reliable sizing:
  // the footer script can load AFTER the app has already announced its height, so
  // we proactively request it (and retry a few times to cover slow app loads).
  function requestHeights() {
    var frames = document.querySelectorAll('iframe[src*="' + APP_HOST + '"]');
    for (var i = 0; i < frames.length; i++) {
      try {
        frames[i].contentWindow.postMessage({ type: 'wainui-request-height' }, '*');
      } catch (err) {}
    }
  }

  window.addEventListener('message', onMessage);
  window.addEventListener('load', requestHeights);
  [200, 600, 1200, 2500, 4000].forEach(function (t) { setTimeout(requestHeights, t); });
  if (document.readyState === 'complete') requestHeights();
})();
