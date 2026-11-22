/* Switch the sticky header to a dark treatment when it overlaps a dark page band. */
(function () {
  'use strict';
  function init() {
    var nav = document.querySelector('header.site-nav');
    var bands = Array.from(document.querySelectorAll('.time-value'));
    if (!nav || !bands.length) return;

    function update() {
      var navBox = nav.getBoundingClientRect();
      var overlaps = bands.some(function (band) {
        var box = band.getBoundingClientRect();
        return box.top < navBox.bottom && box.bottom > navBox.top;
      });
      nav.classList.toggle('is-over-dark', overlaps);
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    if (typeof ResizeObserver === 'function') {
      var observer = new ResizeObserver(update);
      observer.observe(nav);
      bands.forEach(function (band) { observer.observe(band); });
    }
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
