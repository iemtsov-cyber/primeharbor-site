(() => {
  'use strict';
  const panel = document.querySelector('.hero-brand');
  if (!panel) return;
  const video = panel.querySelector('video');
  const button = panel.querySelector('.hero-film-control');
  const label = button.querySelector('span');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = Boolean(navigator.connection?.saveData) || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');
  let userPaused = false, userStarted = false, inView = true, failed = false;
  video.muted = true;
  video.defaultMuted = true;
  const wantsPlayback = () => !motion.matches && !document.hidden && inView && !userPaused && (!saveData || userStarted) && !failed;
  function updateControl() {
    const playing = !video.paused && !video.ended && !motion.matches;
    const ru = document.documentElement.lang === 'ru';
    panel.classList.toggle('is-playing', playing);
    button.hidden = motion.matches || failed;
    label.textContent = playing ? (ru ? 'Пауза' : 'Pause') : (ru ? 'Включить фон' : 'Play background');
    button.setAttribute('aria-label', playing ? (ru ? 'Остановить фоновое видео' : 'Pause background video') : (ru ? 'Включить фоновое видео без звука' : 'Play muted background video'));
  }
  function reconcile() {
    if (!wantsPlayback()) {
      video.pause();
      updateControl();
      return;
    }
    if (!video.getAttribute('src')) {
      video.src = matchMedia('(max-width: 760px)').matches ? video.dataset.mobile : video.dataset.desktop;
    }
    video.play().then(() => {
      if (!wantsPlayback()) video.pause();
      updateControl();
    }).catch(() => { updateControl(); });
  }
  button.addEventListener('click', () => {
    if (video.paused) { userPaused = false; userStarted = true; }
    else { userPaused = true; }
    reconcile();
  });
  video.addEventListener('playing', updateControl);
  video.addEventListener('pause', updateControl);
  video.addEventListener('error', () => { failed = true; video.pause(); updateControl(); });
  motion.addEventListener('change', () => {
    if (motion.matches) {
      video.pause(); video.removeAttribute('src'); video.load();
    }
    reconcile();
  });
  document.addEventListener('visibilitychange', reconcile);
  new MutationObserver(updateControl).observe(document.documentElement, {attributes:true, attributeFilter:['lang']});
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    reconcile();
  }, {threshold:.05}).observe(panel);
  updateControl();
  reconcile();
})();
