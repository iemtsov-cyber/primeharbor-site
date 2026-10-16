(() => {
  'use strict';
  const panel = document.querySelector('.brand-intro');
  if (!panel) return;
  const video = panel.querySelector('video');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = Boolean(navigator.connection?.saveData) || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');
  let inView = true, failed = false, blocked = false, playPending = false;
  video.muted = true;
  video.defaultMuted = true;
  video.controls = false;
  const wantsPlayback = () => !motion.matches && !saveData && !document.hidden && inView && !failed && !blocked;
  function updatePoster() {
    panel.classList.toggle('is-playing', !video.paused && !video.ended && video.readyState >= 2 && !motion.matches);
  }
  function reconcile() {
    video.autoplay = wantsPlayback();
    if (!wantsPlayback()) { video.pause(); updatePoster(); return; }
    if (!video.getAttribute('src')) video.src = matchMedia('(max-width: 760px)').matches ? video.dataset.mobile : video.dataset.desktop;
    if (playPending || !video.paused) return;
    playPending = true;
    video.play().then(() => {
      if (!wantsPlayback()) video.pause();
      updatePoster();
    }).catch(error => {
      if (error.name === 'NotAllowedError') { blocked = true; video.autoplay = false; }
      updatePoster();
    }).finally(() => { playPending = false; });
  }
  video.addEventListener('playing', updatePoster);
  video.addEventListener('pause', updatePoster);
  video.addEventListener('loadeddata', reconcile);
  video.addEventListener('canplay', reconcile);
  video.addEventListener('error', () => { failed = true; video.autoplay = false; video.pause(); updatePoster(); });
  motion.addEventListener('change', () => {
    if (motion.matches) { video.autoplay = false; video.pause(); video.removeAttribute('src'); video.load(); }
    reconcile();
  });
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('pageshow', reconcile);
  const header = document.querySelector('.site-header');
  if (header && 'ResizeObserver' in window) {
    new ResizeObserver(() => panel.style.setProperty('--hero-header-height', `${header.getBoundingClientRect().height}px`)).observe(header);
  }
  new IntersectionObserver(entries => { inView = entries[0].isIntersecting; reconcile(); }, {threshold:.05}).observe(panel);
  updatePoster();
  reconcile();
})();
