/* Archiebase mobile navigation: a selected destination should never leave the menu covering the page. */
(function () {
  'use strict';
  function init() {
    var menus = Array.from(document.querySelectorAll('details.mobile-menu'));
    if (!menus.length) return;

    function closeAll() {
      menus.forEach(function (menu) { menu.open = false; });
    }
    menus.forEach(function (menu) {
      // Handles taps and keyboard activation. Let the link navigate normally.
      menu.addEventListener('click', function (event) {
        var target = event.target;
        if (target && target.closest && target.closest('nav a[href]')) {
          menu.open = false;
        }
      });
    });

    // Avoid a stranded open dropdown after an in-page jump or browser history change.
    window.addEventListener('hashchange', closeAll);

    // Close when tapping elsewhere on the page.
    document.addEventListener('pointerdown', function (event) {
      if (menus.some(function (menu) { return menu.open && !menu.contains(event.target); })) closeAll();
    });

    // Support keyboard and screen-reader navigation.
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        var previouslyOpen = menus.find(function (menu) { return menu.open; });
        if (!previouslyOpen) return;
        closeAll();
        var summary = previouslyOpen.querySelector('summary');
        if (summary) summary.focus();
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
