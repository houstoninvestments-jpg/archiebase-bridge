const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const cover = document.querySelector('.cover');
let frame = 0;

function drawHero() {
  frame = 0;
  const box = cover.getBoundingClientRect();
  const progress = Math.max(0, Math.min(1, -box.top / box.height));
  cover.style.setProperty('--travel', progress.toFixed(4));
}

function scheduleDraw() {
  if (!frame) frame = requestAnimationFrame(drawHero);
}

function syncMotion() {
  window.removeEventListener('scroll', scheduleDraw);
  window.removeEventListener('resize', scheduleDraw);
  cancelAnimationFrame(frame);
  frame = 0;
  if (reducedMotion.matches) {
    cover.style.removeProperty('--travel');
    return;
  }
  window.addEventListener('scroll', scheduleDraw, {passive:true});
  window.addEventListener('resize', scheduleDraw);
  drawHero();
}

syncMotion();
reducedMotion.addEventListener('change', syncMotion);

if (typeof navigator.vibrate === 'function') {
  document.addEventListener('click', event => {
    if (reducedMotion.matches || !event.isTrusted || event.detail === 0) return;
    const touch = event.pointerType === 'touch' ||
      (!event.pointerType && matchMedia('(pointer: coarse)').matches);
    if (touch && event.target.closest('.solid, .c-link, .hero-art, .return-key, .service summary')) {
      navigator.vibrate(12);
    }
  });
}
