/* Consent gate for the talent page. No vendor request is made before opt-in.
 * Yandex API: https://yandex.ru/support/metrica/en/code/counter-initialize
 * Withdrawal: https://yandex.ru/support/metrica/ru/code/counter-spa-setup
 */
(() => {
  'use strict';
  const ID = 113659573;
  const KEY = 'primeharbor-analytics-consent';
  const VERSION = '2026-10-17-v1';
  const LIFETIME = 180 * 24 * 60 * 60 * 1000;
  const QUERY = {utm_source:'primeharbor', utm_medium:'email', utm_campaign:'recruitment_2026', utm_content:'signature_link'};
  const ANCHORS = new Set(['', '#top', '#main', '#coordinator', '#sectors', '#process', '#terms', '#enquiry', '#legal-heading']);
  const banner = document.querySelector('[data-analytics-banner]');
  if (!banner) return;
  const status = banner.querySelector('[data-consent-status]');
  const reopen = document.querySelector('[data-analytics-settings]');
  let active = false, loading = false, generation = 0, observer, expiryTimer;

  function approvedUrl() {
    const u = new URL(location.href);
    if (u.origin !== 'https://primeharbor.ru' || u.pathname !== '/talent.html' || !ANCHORS.has(u.hash)) return null;
    const entries = [...u.searchParams];
    if (new Set(entries.map(([k]) => k)).size !== entries.length || entries.some(([k,v]) => QUERY[k] !== v)) return null;
    u.hash = '';
    return u.href;
  }
  function readChoice() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY));
      if (c && c.version === VERSION && typeof c.statistics === 'boolean' && typeof c.replay === 'boolean' &&
          (!c.replay || c.statistics) && Number.isFinite(c.expires) && c.expires > Date.now() && c.expires <= Date.now() + LIFETIME + 60000) return c;
    } catch {}
    return null;
  }
  function allowed() { return !!(readChoice()?.statistics && approvedUrl()); }
  function showStatus(ru, en) {
    status.dataset.ru = ru; status.dataset.en = en;
    status.textContent = document.documentElement.lang === 'en' ? en : ru;
  }
  function currentStatus() {
    const c = readChoice();
    if (!c) return showStatus('Выбор ещё не сделан. Аналитика отключена.', 'No choice yet. Analytics is off.');
    if (!c.statistics) return showStatus('Ваш выбор: аналитика отключена.', 'Your choice: analytics is off.');
    if (!approvedUrl()) return showStatus('Аналитика недоступна для этого адреса страницы.', 'Analytics is unavailable for this page address.');
    if (c.replay) showStatus('Ваш выбор: статистика и Вебвизор.', 'Your choice: statistics and Session Replay.');
    else showStatus('Ваш выбор: только статистика.', 'Your choice: statistics only.');
  }
  function protectContent() {
    document.querySelectorAll('form,.legal-details,[data-private],[data-sensitive]').forEach(el => {
      el.classList.add('ym-hide-content', 'ym-disable-submit');
      el.classList.remove('ym-show-content', 'ym-record-keys');
      el.querySelectorAll('.ym-show-content,.ym-record-keys').forEach(child => child.classList.remove('ym-show-content','ym-record-keys'));
    });
    document.querySelectorAll('input,textarea,select,[contenteditable]').forEach(el => {
      el.classList.add('ym-disable-keys', 'ym-hide-content');
      el.classList.remove('ym-show-content', 'ym-record-keys');
    });
  }
  function clearVendorStorage() {
    for (const name of ['localStorage', 'sessionStorage']) {
      try { const store = window[name]; Object.keys(store).filter(k => k.startsWith('_ym')).forEach(k => store.removeItem(k)); } catch {}
    }
    document.cookie.split(';').map(s => s.trim().split('=')[0]).filter(k => k.startsWith('_ym')).forEach(name => {
      for (const domain of ['', location.hostname, '.' + location.hostname]) {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax' + (domain ? '; domain=' + domain : '');
      }
    });
  }
  function stop() {
    active = false; generation++;
    clearTimeout(expiryTimer);
    observer?.disconnect();
    if (typeof window.ym === 'function') {
      if (Array.isArray(window.ym.a)) window.ym.a.length = 0;
      window.ym(ID, 'destruct');
    }
    clearVendorStorage();
  }
  function goal(name) {
    if (!active || !allowed()) return;
    window.ym(ID, 'reachGoal', name);
  }
  function start() {
    const c = readChoice(), url = approvedUrl();
    if (active || loading || !c?.statistics || !url) return;
    protectContent();
    observer = new MutationObserver(protectContent);
    observer.observe(document.body, {childList:true, subtree:true});
    const epoch = ++generation;
    loading = true;
    // Load the unmodified official library only after an explicit saved choice.
    window.ym = window.ym || function() { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    const script = document.createElement('script');
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = 'https://mc.yandex.ru/metrika/tag.js?id=' + ID;
    script.onload = () => {
      loading = false;
      if (epoch !== generation || !allowed()) return;
      protectContent();
      window.ym(ID, 'init', {
        defer:true, webvisor:c.replay, clickmap:false, trackLinks:false,
        trackHash:false, accurateTrackBounce:false, ecommerce:false,
        childIframe:false, sendTitle:false, referrer:'', url
      });
      active = true;
      window.ym(ID, 'hit', url, {title:'Prime Harbor — Talent', referer:''});
      goal('talent_view');
      expiryTimer = setTimeout(() => { stop(); location.reload(); }, Math.min(c.expires - Date.now(), 2147483647));
    };
    script.onerror = () => { loading = false; observer?.disconnect(); };
    document.head.appendChild(script);
  }
  function saveChoice(statistics, replay) {
    const wasStarted = active || loading;
    const c = {version:VERSION, statistics, replay, expires:Date.now() + LIFETIME};
    try { localStorage.setItem(KEY, JSON.stringify(c)); }
    catch {
      stop();
      showStatus('Не удалось сохранить выбор. Аналитика отключена.', 'Your choice could not be saved. Analytics is off.');
      return;
    }
    banner.hidden = true;
    currentStatus();
    if (wasStarted) { stop(); location.reload(); return; }
    if (statistics) start(); else clearVendorStorage();
    if (reopen && document.activeElement && banner.contains(document.activeElement)) reopen.focus({preventScroll:true});
  }
  banner.querySelectorAll('[data-analytics-choice]').forEach(button => button.addEventListener('click', () => {
    const choice = button.dataset.analyticsChoice;
    saveChoice(choice !== 'reject', choice === 'replay');
  }));
  reopen?.addEventListener('click', () => {
    currentStatus(); banner.hidden = false;
    banner.querySelector('button').focus({preventScroll:true});
  });
  banner.querySelector('[data-analytics-close]')?.addEventListener('click', () => { banner.hidden = true; reopen?.focus({preventScroll:true}); });
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || !active) return;
    const u = new URL(link.href, location.href);
    if (u.origin === 'https://primeharbor.ru' && u.pathname === '/assets/docs/Prime_Harbor_Recruitment_Sri_Lanka_2026.pdf' && !u.search && !u.hash) goal('proposal_download');
    else if (u.protocol === 'tel:' && u.pathname === '+74951081801') goal('phone_click');
    else if (u.protocol === 'mailto:' && ['igor@primeharbor.ru','contact@primeharbor.ru'].includes(u.pathname)) goal('email_click');
  }, true);
  // A newly added unknown URL parameter must never enter a running recording.
  function checkAddress() { if ((active || loading) && !approvedUrl()) { stop(); location.reload(); } }
  window.addEventListener('hashchange', checkAddress);
  window.addEventListener('popstate', checkAddress);
  window.addEventListener('storage', event => {
    if (event.key === KEY) {
      if (active || loading) { stop(); location.reload(); }
      else { currentStatus(); banner.hidden = !!readChoice(); start(); }
    }
  });
  protectContent();
  currentStatus();
  banner.hidden = !!readChoice();
  start();
})();
