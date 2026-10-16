(() => {
  'use strict';
  const panel = document.querySelector('.hero-brand');
  if (!panel) return;
  const video = panel.querySelector('video');
  const button = panel.querySelector('.hero-film-control');
  const label = button.querySelector('span');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = Boolean(navigator.connection?.saveData) || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');
  let userPaused = false, userStarted = false, inView = true, failed = false, playPending = false;
  video.muted = true;
  video.defaultMuted = true;
  const wantsPlayback = () => (!motion.matches || userStarted) && !document.hidden && inView && !userPaused && (!saveData || userStarted) && !failed;
  function updateControl() {
    const playing = !video.paused && !video.ended && video.readyState >= 2;
    const ru = document.documentElement.lang === 'ru';
    panel.classList.toggle('is-playing', playing);
    button.hidden = false;
    label.textContent = playing ? (ru ? 'Пауза' : 'Pause') : (ru ? 'Включить фон' : 'Play background');
    button.setAttribute('aria-label', playing ? (ru ? 'Остановить фоновое видео' : 'Pause background video') : (ru ? 'Включить фоновое видео без звука' : 'Play muted background video'));
  }
  function reconcile() {
    video.autoplay = wantsPlayback();
    if (!wantsPlayback()) {
      video.pause();
      updateControl();
      return;
    }
    if (!video.getAttribute('src')) {
      video.src = matchMedia('(max-width: 760px)').matches ? video.dataset.mobile : video.dataset.desktop;
    }
    if (playPending || !video.paused) return;
    playPending = true;
    video.play().then(() => {
      if (!wantsPlayback()) video.pause();
      updateControl();
    }).catch(() => { updateControl(); }).finally(() => { playPending = false; });
  }
  button.addEventListener('click', () => {
    if (video.paused) {
      userPaused = false; userStarted = true;
      if (failed) { failed = false; video.load(); }
    }
    else { userPaused = true; }
    reconcile();
  });
  video.addEventListener('playing', updateControl);
  video.addEventListener('pause', updateControl);
  video.addEventListener('loadeddata', reconcile);
  video.addEventListener('canplay', reconcile);
  video.addEventListener('error', () => { failed = true; video.pause(); updateControl(); });
  motion.addEventListener('change', () => {
    userStarted = false;
    if (motion.matches) {
      video.autoplay = false; video.pause(); video.removeAttribute('src'); video.load();
    }
    reconcile();
  });
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('pageshow', event => {
    // A fresh entry, including Safari's back/forward cache, starts with the default preference.
    if (event.persisted) { userPaused = false; userStarted = false; }
    reconcile();
  });
  const header = document.querySelector('.site-header');
  if (header && 'ResizeObserver' in window) {
    new ResizeObserver(() => {
      panel.style.setProperty('--hero-header-height', `${header.getBoundingClientRect().height}px`);
    }).observe(header);
  }
  new MutationObserver(updateControl).observe(document.documentElement, {attributes:true, attributeFilter:['lang']});
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    reconcile();
  }, {threshold:.05}).observe(panel);
  updateControl();
  reconcile();
})();
