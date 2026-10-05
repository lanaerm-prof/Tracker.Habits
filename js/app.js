/* =========================================================
   app.js — маршрутизация, авторизация, оболочка приложения
   ========================================================= */

(function () {
  'use strict';

  const authScreen = document.getElementById('authScreen');
  const appEl = document.getElementById('app');
  const view = document.getElementById('view');
  const pageTitle = document.getElementById('pageTitle');
  const topAddBtn = document.getElementById('topAddBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const burger = document.getElementById('burgerBtn');
  const splash = document.getElementById('splash');

  const APP_NAME = 'Ритм';

  const ROUTES = {
    today:      { render: Views.today,      title: 'Сегодня',     nav: 'today' },
    habits:     { render: Views.habits,     title: 'Привычки',    nav: 'habits' },
    categories: { render: Views.categories, title: 'Категории',   nav: 'categories' },
    calendar:   { render: Views.calendar,   title: 'Календарь',   nav: 'calendar' },
    stats:      { render: Views.stats,      title: 'Статистика',  nav: 'stats' },
    settings:   { render: Views.settings,   title: 'Настройки',   nav: 'settings' }
  };

  /* ---------------- логотип и значки в разметке ---------------- */
  function paintIcons(rootEl) {
    const scope = rootEl || document;
    scope.querySelectorAll('[data-logo]').forEach(el => {
      if (el.dataset.painted) return;
      el.innerHTML = logoSVG();
      el.dataset.painted = '1';
    });
    scope.querySelectorAll('[data-icon]').forEach(el => {
      if (el.dataset.painted) return;
      el.innerHTML = UI.icon(el.dataset.icon);
      el.dataset.painted = '1';
    });
  }

  /* У каждого экземпляра логотипа — свой id градиента:
     ссылка url(#id) иначе находит первый попавшийся элемент
     (сплэш скрыт через display:none — и заливка перестаёт рисоваться). */
  let logoSeq = 0;
  function logoSVG() {
    const g = 'ritmG' + (++logoSeq);
    return '<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">' +
        '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#8FB8B2"/><stop offset="1" stop-color="#668F89"/>' +
        '</linearGradient></defs>' +
        '<rect width="512" height="512" rx="116" fill="url(#' + g + ')"/>' +
        '<path d="M256 126 a130 130 0 1 1 -91.9 38.1" fill="none" stroke="#F7F5F1" stroke-width="34" stroke-linecap="round"/>' +
        '<circle cx="256" cy="256" r="42" fill="#F7F5F1"/>' +
      '</svg>';
  }

  /* ---------------- маршрутизация ---------------- */
  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '').replace(/\/$/, '');
    const parts = raw.split('/').filter(Boolean);
    if (!parts.length) return { key: 'today', params: {} };
    if (parts[0] === 'habit') {
      const id = parts[1] && parts[1] !== 'new' ? parts[1] : null;
      return { key: 'habitForm', params: { id: id } };
    }
    if (ROUTES[parts[0]]) return { key: parts[0], params: {} };
    return { key: 'today', params: {} };
  }

  function errorState(err) {
    view.innerHTML =
      '<div class="empty">' +
        '<div class="empty-emoji">' + UI.icon('warning') + '</div>' +
        '<h3>Что-то пошло не так</h3>' +
        '<p>' + UI.esc(String(err && err.message ? err.message : err)) + '</p>' +
        '<button class="btn btn-primary" type="button" id="retryBtn">Попробовать снова</button>' +
      '</div>';
    const btn = view.querySelector('#retryBtn');
    if (btn) btn.addEventListener('click', router);
  }

  /* Делегаты вешаются на #view и переживают смену экрана (см. Views.delegate).
     Если их не снять, обработчик календаря продолжает ловить клики уже на
     экране «Сегодня»: экран переключается на календарь, а боковое меню всё
     ещё показывает «Сегодня». */
  const DELEGATE_TYPES = ['click', 'keydown', 'keyup', 'input', 'change', 'submit', 'focusin', 'focusout'];
  function clearDelegates() {
    DELEGATE_TYPES.forEach((type) => {
      const key = '__delegate_' + type;
      if (view[key]) {
        view.removeEventListener(type, view[key]);
        delete view[key];
      }
    });
  }

  function router() {
    if (!Store.Auth.user()) return;
    const { key, params } = parseHash();

    let fn, title, nav;
    if (key === 'habitForm') {
      fn = Views.habitForm;
      title = params.id ? 'Редактирование' : 'Новая привычка';
      nav = 'habits';
    } else {
      const r = ROUTES[key] || ROUTES.today;
      fn = r.render; title = r.title; nav = r.nav;
    }

    clearDelegates();
    /* экран «Сегодня» по этому флагу понимает, что вернулись на него заново,
       и проигрывает анимацию входа кольца (при отметке привычки её не будет) */
    view.dataset.screen = '';

    try {
      fn(view, params);
    } catch (err) {
      console.error(err);
      errorState(err);
    }

    /* имя экрана в data-атрибуте: по нему стили подгоняют высоту под экран;
       «Сегодня» помечает себя само — ему важно сохранить флаг анимации */
    if (!view.dataset.screen) view.dataset.screen = key;

    paintIcons(view);

    pageTitle.textContent = title;
    document.title = title + ' · ' + APP_NAME;
    /* название экрана в шапке — только на «Сегодня»: ниже оно уже есть
       и в заголовке страницы, и в боковом меню */
    pageTitle.classList.toggle('is-shown', key === 'today');
    /* «+ Привычка» — только в разделах «Привычки» и «Категории» */
    if (topAddBtn) topAddBtn.classList.toggle('is-shown', nav === 'habits' || nav === 'categories');
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('is-active', a.dataset.route === nav);
    });
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function rerender() { router(); }

  /* ---------------- боковое меню ---------------- */
  function openSidebar() {
    sidebar.classList.add('is-open');
    overlay.hidden = false;
    burger.setAttribute('aria-expanded', 'true');
  }
  function closeSidebar() {
    sidebar.classList.remove('is-open');
    overlay.hidden = true;
    burger.setAttribute('aria-expanded', 'false');
  }
  burger.addEventListener('click', () => {
    sidebar.classList.contains('is-open') ? closeSidebar() : openSidebar();
  });
  overlay.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });

  /* ---------------- профиль в боковом меню ---------------- */
  function refreshUserChip() {
    const user = Store.Auth.user();
    if (!user) return;
    const name = Store.Settings.get().name || user.name || user.email.split('@')[0];
    document.getElementById('userName').textContent = name;
    document.getElementById('userMail').textContent = user.email;
    document.getElementById('userAvatar').textContent = (name || user.email).trim().charAt(0).toUpperCase() || '?';
  }

  /* ---------------- вход / выход ---------------- */
  function showApp() {
    authScreen.classList.add('hidden');
    appEl.classList.remove('hidden');
    UI.applyTheme(Store.Settings.get().theme);
    refreshUserChip();
    if (!location.hash) location.hash = '#/today';
    router();
    syncNotifications();
  }

  function showAuth() {
    appEl.classList.add('hidden');
    authScreen.classList.remove('hidden');
    closeSidebar();
  }

  function signOut() {
    Store.Auth.signOut();
    UI.toast('Вы вышли из аккаунта');
    showAuth();
  }

  /** удаление профиля: сначала аккаунт стирается, потом показывается экран входа */
  function deleteProfile() {
    const r = Store.Auth.deleteAccount();
    if (!r || !r.ok) {
      UI.toast((r && r.error) || 'Не удалось удалить профиль', 'error');
      return false;
    }
    UI.toast('Профиль удалён');
    showAuth();
    return true;
  }

  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const loginError = document.getElementById('loginError');
  const signupError = document.getElementById('signupError');

  document.querySelectorAll('[data-auth-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const isLogin = tab.dataset.authTab === 'login';
      document.querySelectorAll('[data-auth-tab]').forEach(t => {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      loginForm.classList.toggle('hidden', !isLogin);
      signupForm.classList.toggle('hidden', isLogin);
      loginError.textContent = '';
      signupError.textContent = '';
    });
  });

  function validate(email, password, errorEl) {
    errorEl.textContent = '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = 'Введите корректный логин / email';
      return false;
    }
    if (!password || password.length < 4) {
      errorEl.textContent = 'Пароль должен быть не короче 4 символов';
      return false;
    }
    return true;
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginForm.querySelector('[name="email"]').value;
    const password = loginForm.querySelector('[name="password"]').value;
    if (!validate(email, password, loginError)) return;
    Store.Auth.signIn(email, password).then(res => {
      if (!res.ok) { loginError.textContent = res.error; return; }
      loginForm.reset();
      UI.toast('С возвращением!');
      showApp();
    });
  });

  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = signupForm.querySelector('[name="name"]').value;
    const email = signupForm.querySelector('[name="email"]').value;
    const password = signupForm.querySelector('[name="password"]').value;
    if (!validate(email, password, signupError)) return;
    Store.Auth.signUp(email, password, name).then(res => {
      if (!res.ok) { signupError.textContent = res.error; return; }
      signupForm.reset();
      UI.toast('Аккаунт создан. Начните с одной привычки.');
      showApp();
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', signOut);
  document.getElementById('topAddBtn').addEventListener('click', () => { location.hash = '#/habit/new'; });
  /* «+ Привычка» в заголовке разделов (ПК): шапки сверху больше нет */
  view.addEventListener('click', (e) => {
    if (e.target.closest('#pageAddBtn')) location.hash = '#/habit/new';
  });

  window.addEventListener('hashchange', router);

  /* ---------------- уведомления ----------------
     Два источника:
       1) per-habit reminder (время внутри привычки)
       2) глобальное ежедневное напоминание settings.reminderTime
     Уведомление показывает service worker, если вкладка в фоне.      */
  const fired = {};

  function notify(title, body, tag) {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller && typeof navigator.serviceWorker.ready === 'object') {
        navigator.serviceWorker.ready.then(reg => {
          if (reg && reg.showNotification) {
            reg.showNotification(title, { body: body, icon: 'icons/icon-192.png', tag: tag, lang: 'ru' });
            return;
          }
          if (typeof Notification !== 'undefined') new Notification(title, { body: body, tag: tag });
        }).catch(() => {
          if (typeof Notification !== 'undefined') new Notification(title, { body: body, tag: tag });
        });
        return;
      }
      if (typeof Notification !== 'undefined') new Notification(title, { body: body, icon: 'icons/icon-192.png', tag: tag });
    } catch (e) { /* уведомления недоступны — не мешаем работе */ }
  }

  function scheduleNotifications() {
    const st = Store.Settings.get();
    if (!st.notifications || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!Store.Auth.user()) return;

    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const today = Store.dates.today();

    /* персональные напоминания по привычкам */
    Store.Habits.active().forEach(h => {
      if (!h.reminder || h.reminder !== hhmm) return;
      if (!Store.Habits.isScheduled(h, today)) return;
      if (Store.Habits.isDone(h, today)) return;
      const key = today + '|' + h.id + '|' + h.reminder;
      if (fired[key]) return;
      fired[key] = true;
      notify(APP_NAME, `Пора выполнить: ${h.name}`, h.id);
    });

    /* общее ежедневное напоминание */
    const remindAt = st.reminderTime || '20:00';
    const due = Store.Habits.active().filter(h => Store.Habits.isScheduled(h, today) && !Store.Habits.isDone(h, today));
    if (hhmm === remindAt) {
      const key = today + '|global|' + remindAt;
      if (!fired[key]) {
        fired[key] = true;
        notify(APP_NAME, due.length
          ? `Осталось ${due.length} из сегодняшних привычек. Можно закрыть день.`
          : 'Отлично! Все привычки выполнены.', key);
      }
    }
  }

  function syncNotifications() { scheduleNotifications(); }
  setInterval(scheduleNotifications, 20000);

  /* ---------------- установка приложения (PWA) ---------------- */
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    if (window.app) window.app.deferredInstall = e;
  });
  function promptInstall() {
    if (!deferredInstall) { UI.toast('Установка доступна из меню браузера'); return Promise.resolve(null); }
    const evt = deferredInstall;
    deferredInstall = null;
    if (window.app) window.app.deferredInstall = null;
    const p = evt.prompt();
    return (p && p.then ? p : Promise.resolve(null)).then(res => {
      if (res && res.outcome === 'accepted') UI.toast('Приложение установлено');
      return res;
    }).catch(() => null);
  }
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    if (window.app) window.app.deferredInstall = null;
    UI.toast('Приложение установлено');
  });

  /* ---------------- service worker (PWA / офлайн) ---------------- */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
    });
  }

  /* ---------------- экспорт API для views ---------------- */
  window.app = { rerender, refreshUserChip, signOut, deleteProfile, syncNotifications, promptInstall, deferredInstall };

  /* ---------------- старт ---------------- */
  function hideSplash() {
    if (!splash) return;
    splash.classList.add('is-hiding');
    setTimeout(() => { splash.classList.add('is-hidden'); }, 320);
  }

  paintIcons(document);

  const user = Store.Auth.restore();
  UI.applyTheme(user ? Store.Settings.get().theme : 'light');
  if (user) showApp();
  else showAuth();

  /* сплэш прячем после первого кадра (состояние Loading → готово) */
  if (splash) {
    if (document.readyState === 'complete') requestAnimationFrame(hideSplash);
    else window.addEventListener('load', () => requestAnimationFrame(hideSplash));
    setTimeout(hideSplash, 1500); // страховка
  }
})();
