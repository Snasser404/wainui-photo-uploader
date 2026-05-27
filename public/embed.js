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

  function onMessage(e) {
    var data = e && e.data;
    if (!data || data.type !== 'wainui-height' || !data.height) return;
    var frames = document.querySelectorAll('iframe[src*="' + APP_HOST + '"]');
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      // Resize only the iframe that actually sent the message.
      if (f.contentWindow === e.source) {
        // Use !important so it beats any theme CSS that constrains iframe height.
        f.style.setProperty('height', data.height + 'px', 'important');
      }
    }
  }

  window.addEventListener('message', onMessage);
})();
