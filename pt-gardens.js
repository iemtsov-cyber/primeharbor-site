(() => {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.mobile-menu');
  let language = 'ru';
  function closeMenu(returnFocus = false) {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', language === 'ru' ? 'Открыть меню' : 'Open menu');
    if (returnFocus) toggle.focus();
  }
  function setLanguage(value) {
    language = value === 'en' ? 'en' : 'ru';
    document.documentElement.lang = language;
    document.querySelectorAll('[data-ru][data-en]').forEach(el => el.textContent = el.dataset[language]);
    document.querySelectorAll('[data-alt-ru]').forEach(el => el.alt = el.getAttribute('data-alt-' + language));
    document.querySelectorAll('.lang-btn').forEach(el => {
      const active = el.dataset.lang === language;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });
    document.title = language === 'ru' ? 'P.T. Gardens Hotel — Prime Harbor' : 'P.T. Gardens Hotel — Prime Harbor';
    const description = language === 'ru' ? 'P.T. Gardens Hotel: гостинично-банкетный комплекс в Шри-Ланке. Параметры объекта, фотографии и инвестиционный меморандум.' : 'P.T. Gardens Hotel: a hotel and events property in Sri Lanka. Asset details, photographs and investment documents.';
    document.querySelector('meta[name="description"]').content = description;
    document.querySelector('meta[property="og:description"]').content = description;
    document.querySelector('meta[property="og:title"]').content = document.title;
    document.querySelector('.brand-mark').setAttribute('aria-label', language === 'ru' ? 'Prime Harbor — главная' : 'Prime Harbor home');
    document.querySelectorAll('nav').forEach(el => el.setAttribute('aria-label', language === 'ru' ? 'Основная навигация' : 'Primary navigation'));
    document.querySelector('.language-switch').setAttribute('aria-label', language === 'ru' ? 'Язык' : 'Language');
    closeMenu();
    try { localStorage.setItem('primeharbor-language', language); } catch {}
  }
  let preferred = navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  try { preferred = localStorage.getItem('primeharbor-language') || preferred; } catch {}
  document.querySelectorAll('.lang-btn').forEach(el => el.addEventListener('click', () => setLanguage(el.dataset.lang)));
  toggle.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    toggle.setAttribute('aria-expanded', String(!menu.hidden));
    toggle.setAttribute('aria-label', language === 'ru' ? (menu.hidden ? 'Открыть меню' : 'Закрыть меню') : (menu.hidden ? 'Open menu' : 'Close menu'));
  });
  menu.querySelectorAll('a').forEach(el => el.addEventListener('click', () => closeMenu()));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) closeMenu(true); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !toggle.contains(e.target)) closeMenu(); });
  document.addEventListener('focusin', e => { if (!menu.hidden && !menu.contains(e.target) && !document.querySelector('.site-header').contains(e.target)) closeMenu(); });
  matchMedia('(min-width: 1101px)').addEventListener('change', e => { if (e.matches) closeMenu(); });
  document.getElementById('year').textContent = new Date().getFullYear();
  setLanguage(preferred);
})();

(() => {
 const video=document.querySelector('#hotel-video'),button=document.querySelector('.property-video-play'),error=document.querySelector('.property-video-error');
 document.querySelectorAll('[data-video-start]').forEach(link=>link.addEventListener('click',()=>button.click()));
 button.addEventListener('click',async()=>{
   button.disabled=true;error.hidden=true;
   try {await video.play();} catch {error.hidden=false;} finally {button.disabled=false;}
 });
 video.addEventListener('play',()=>{button.hidden=true;error.hidden=true;});
 video.addEventListener('error',()=>{error.hidden=false;button.hidden=false;button.disabled=false;});
 video.addEventListener('ended',()=>{button.hidden=false;});
})();

(() => {
 const dialog=document.querySelector('.property-dialog'),image=dialog.querySelector('img'),caption=dialog.querySelector('p');
 document.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{
  const original=button.querySelector('img'); image.src=button.dataset.photo; image.alt=original.alt;caption.textContent=original.alt;dialog.showModal();
 }));
 dialog.querySelector('button').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
})();
