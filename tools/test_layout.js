// Проверка вёрстки в настоящем headless Chrome (CDP):
//   1) запустите Chrome с --remote-debugging-port=9333 (см. README)
//   2) node tools/test_layout.js
// Проверяет горизонтальный скролл на 1920 / 768 / 360 px и делает скриншоты.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9333';
const APP = process.env.APP_URL || 'http://127.0.0.1:8123/index.html';
const SHOTS = path.join(os.tmpdir(), 'opencode', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok  -', msg);
  else { failed++; console.log('  FAIL-', msg); }
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await getJSON(CDP_URL + '/json/list');
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (e) {}
    await sleep(300);
  }
  throw new Error('Chrome CDP недоступен на ' + CDP_URL);
}

const SETUP = `
(async function () {
  if (!Store.Auth.user()) {
    let r = await Store.Auth.signUp('demo@mail.ru', '1234', 'Аня');
    if (!r.ok) r = await Store.Auth.signIn('demo@mail.ru', '1234');
    if (!r.ok) return 'auth: ' + r.error;
  }
  if (Store.Habits.all().length === 0) {
    const mk = (p, back) => { const h = Store.Habits.add(p); if (back) h.createdAt = Date.now() - back * 86400000; return h; };
    const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return Store.dates.ymd(d); };
    const a = mk({ name: 'Выпить 8 стаканов воды', icon: 'water_drop', color: '#B83729', category: 'Здоровье', frequency: 'daily', goal: 8, unit: 'мл', reminder: '09:00' }, 30);
    const b = mk({ name: 'Тренировка 30 минут', icon: 'directions_run', color: '#668F89', category: 'Спорт и движение', frequency: 'weekly', days: [1, 3, 5], goal: 3, unit: 'подходов' }, 30);
    const c = mk({ name: 'Читать 20 страниц', icon: 'menu_book', color: '#C4775F', category: 'Учёба и работа', frequency: 'daily', goal: 20, unit: 'страниц' }, 30);
    const d = mk({ name: 'Медитация', icon: 'self_improvement', color: '#8FB8B2', category: 'Здоровье', frequency: 'daily', goal: 1, unit: 'мин' }, 14);
    Store.Habits.setArchived(d.id, true);
    for (let i = 1; i <= 24; i++) {
      if (i <= 5) Store.Habits.setCount(a.id, ago(i), 8);
      else if (i % 4 !== 0) Store.Habits.setCount(a.id, ago(i), 8);
      else Store.Habits.setCount(a.id, ago(i), 4);
      const dow = new Date(Date.now() - i * 86400000).getDay();
      if ([1, 3, 5].includes(dow) && i % 6 !== 0) Store.Habits.setCount(b.id, ago(i), 3);
      if (i % 7 !== 3) Store.Habits.setCount(c.id, ago(i), 20);
      if (i <= 9) Store.Habits.setCount(d.id, ago(i), 1);
    }
    return 'seeded';
  }
  return 'exists';
})()`;

const OVERFLOW = `
(function () {
  const vw = document.documentElement.clientWidth;
  const sidebarOpen = document.getElementById('sidebar').classList.contains('is-open');
  const bad = [];
  // элемент лежит в намеренно прокручиваемом по горизонтали контейнере
  function inHScroller(el) {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true;
      p = p.parentElement;
    }
    return false;
  }
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    // закрытое боковое меню уезжает влево — это норма для бургер-навигации
    if (!sidebarOpen && el.closest('#sidebar')) return;
    if (r.right > vw + 1 && inHScroller(el)) return;
    if (r.right > vw + 1) {
      bad.push((el.tagName + '.' + (el.className || '').toString().split(' ')[0]).slice(0, 60) + '[' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
    }
  });
  return {
    vw: vw,
    scrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    overflow: document.documentElement.scrollWidth > vw + 1,
    bad: bad.slice(0, 6)
  };
})()`;

(async function main() {
  const page = await connect();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: APP });
  await sleep(1500);

  const setup = await cdp.send('Runtime.evaluate', { expression: SETUP, returnByValue: true, awaitPromise: true });
  console.log('данные:', JSON.stringify(setup.result && setup.result.value));
  await cdp.send('Runtime.evaluate', { expression: `Store.Settings.set({ theme: 'light' }); UI.applyTheme('light');`, returnByValue: true });
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(1200);

  const ROUTES = [
    ['today', '#/today'],
    ['habits', '#/habits'],
    ['categories', '#/categories'],
    ['new', '#/habit/new'],
    ['calendar', '#/calendar'],
    ['stats', '#/stats'],
    ['settings', '#/settings']
  ];
  const SIZES = [
    [1920, 1080, 'desktop'],
    [768, 1024, 'tablet'],
    [360, 740, 'mobile']
  ];

  for (const [width, height, label] of SIZES) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    for (const [name, hash] of ROUTES) {
      await cdp.send('Runtime.evaluate', { expression: `location.hash = '${hash}'` });
      await sleep(350);
      const r = await cdp.send('Runtime.evaluate', { expression: OVERFLOW, returnByValue: true });
      const v = r.result.value;
      ok(!v.overflow && v.bad.length === 0,
        `${label} ${width}px ${name}: scrollW=${v.scrollW} vw=${v.vw}` + (v.bad.length ? ' → вылезает: ' + v.bad.join(', ') : ''));

      if ((label !== 'tablet') || name === 'today' || name === 'calendar') {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(path.join(SHOTS, `${label}-${name}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
  }

  // открытое бургер-меню на мобильном
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Runtime.evaluate', { expression: `location.hash='#/today'` });
  await sleep(300);
  await cdp.send('Runtime.evaluate', { expression: `document.getElementById('burgerBtn').click()` });
  await sleep(350);
  const menu = await cdp.send('Runtime.evaluate', { expression: OVERFLOW, returnByValue: true });
  ok(!menu.result.value.overflow && menu.result.value.bad.length === 0,
    'открытое бургер-меню 360px: ' + (menu.result.value.bad.join(', ') || 'без вылезания'));
  const menuShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'mobile-menu.png'), Buffer.from(menuShot.data, 'base64'));

  // структурные/визуальные проверки
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Runtime.evaluate', { expression: `location.hash='#/calendar'` });
  await sleep(450);
  const cal = await cdp.send('Runtime.evaluate', {
    expression: `
    (function () {
      const cells = [...document.querySelectorAll('.cal-day[data-date]')];
      const first = cells.find((c) => c.dataset.date.endsWith('-01'));
      const second = cells.find((c) => c.dataset.date.endsWith('-02'));
      const op = (c) => (c ? parseFloat(getComputedStyle(c).opacity) : -1);
      const name = document.querySelector('.day-habits .habit-name');
      const row = document.querySelector('.day-habits .habit-row');
      const h3 = document.querySelector('.day-panel h3');
      const lh = name ? parseFloat(getComputedStyle(name).lineHeight) : 1;
      return {
        o1: op(first), o2: op(second),
        lines: name ? Math.round(name.getBoundingClientRect().height / lh) : 99,
        rowH: row ? Math.round(row.getBoundingClientRect().height) : 0,
        title: h3 ? h3.textContent.trim() : ''
      };
    })()`,
    returnByValue: true
  });
  const cv = cal.result.value;
  ok(cv.o1 === cv.o2 && cv.o1 >= 0.9, `календарь: дни 1 и 2 с одинаковой непрозрачностью (${cv.o1} / ${cv.o2})`);
  ok(cv.lines <= 2, `название в панели дня занимает не больше 2 строк (${cv.lines})`);
  ok(cv.rowH > 0 && cv.rowH < 200, `высота строки в панели дня адекватна (${cv.rowH}px)`);
  ok(!/^[А-ЯЁ]/.test(cv.title.split(' ')[1] || ''), `месяц в заголовке даты со строчной буквы: "${cv.title}"`);

  await cdp.send('Runtime.evaluate', { expression: `location.hash='#/today'` });
  await sleep(400);
  const ui = await cdp.send('Runtime.evaluate', {
    expression: `
    (function () {
      const eyebrow = document.querySelector('.eyebrow');
      const topAdd = document.querySelector('.topbar-add');
      const pt = document.getElementById('pageTitle');
      const tb = document.querySelector('.topbar');
      return {
        bg: getComputedStyle(document.body).backgroundColor,
        headBtns: document.querySelectorAll('.page-head .btn').length,
        eyebrow: eyebrow ? eyebrow.textContent : '',
        topAdd: !!topAdd && topAdd.getBoundingClientRect().width > 0,
        addHref: topAdd ? topAdd.getAttribute('id') : '',
        topbarGone: tb && getComputedStyle(tb).display === 'none',
        titleShown: pt && getComputedStyle(pt).visibility === 'visible' && tb && getComputedStyle(tb).display !== 'none'
      };
    })()`,
    returnByValue: true
  });
  const u = ui.result.value;
  ok(u.bg === 'rgb(247, 245, 241)', 'светлая тема: фон страницы ' + u.bg);
  ok(u.headBtns === 0, 'нет дублирующей кнопки добавления в заголовке');
  ok(!u.topAdd, 'на «Сегодня» кнопки «＋ Привычка» в шапке нет');
  ok(u.topbarGone, 'шапка приложения на ПК скрыта целиком');
  ok(!u.titleShown, 'название экрана в шапке не показывается');
  ok(/^[А-ЯЁ]/.test(u.eyebrow), 'дата в «Сегодня» с заглавной буквы: ' + u.eyebrow);

  await cdp.send('Runtime.evaluate', { expression: `location.hash='#/habits'` });
  await sleep(400);
  const h2 = await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('.page-add').getBoundingClientRect().width > 0`,
    returnByValue: true
  });
  ok(h2.result.value, 'кнопка «＋ Привычка» видима в разделе «Привычки» — на уровне с заголовком');
  const h3 = await cdp.send('Runtime.evaluate', {
    expression: `
    (function () {
      const btn = document.querySelector('.page-add');
      const h1 = document.querySelector('.page-head h1');
      if (!btn || !h1) return null;
      const b = btn.getBoundingClientRect(), t = h1.getBoundingClientRect();
      return { aligned: Math.abs((b.top + b.height / 2) - (t.top + t.height / 2)) < 26, off: Math.round(Math.abs((b.top + b.height / 2) - (t.top + t.height / 2))) };
    })()`,
    returnByValue: true
  });
  ok(h3.result.value && h3.result.value.aligned, 'кнопка «＋ Привычка» на линии заголовка (разница ' + (h3.result.value ? h3.result.value.off : '?') + 'px)');

  // тёмная тема (мобильная + десктоп)
  await cdp.send('Runtime.evaluate', { expression: `Store.Settings.set({theme:'dark'}); UI.applyTheme('dark'); location.hash='#/today';` });
  await sleep(400);
  for (const [width, height, label] of [[1920, 1080, 'desktop'], [360, 740, 'mobile']]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await sleep(300);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(SHOTS, `${label}-today-dark.png`), Buffer.from(shot.data, 'base64'));
    const r = await cdp.send('Runtime.evaluate', { expression: OVERFLOW, returnByValue: true });
    ok(!r.result.value.overflow, `тёмная тема ${width}px: без горизонтального скролла`);
  }

  // PWA: service worker и манифест
  const sw = await cdp.send('Runtime.evaluate', {
    expression: `Promise.all([navigator.serviceWorker.getRegistrations().then((rs) => rs.map((r) => r.scope)),
                 fetch('manifest.webmanifest').then((r) => r.status)]).then((a) => ({ scopes: a[0], manifest: a[1] }))`,
    awaitPromise: true,
    returnByValue: true
  });
  const swv = sw.result.value || {};
  ok((swv.scopes || []).length > 0, 'service worker зарегистрирован: ' + JSON.stringify(swv.scopes || []));
  ok(swv.manifest === 200, 'manifest.webmanifest отдаётся (HTTP ' + swv.manifest + ')');

  // экран входа
  await cdp.send('Runtime.evaluate', { expression: `Store.Settings.set({theme:'light'}); UI.applyTheme('light'); app.signOut();` });
  await sleep(500);
  let s = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'auth-login.png'), Buffer.from(s.data, 'base64'));
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('[data-auth-tab="signup"]').click()` });
  await sleep(300);
  s = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'auth-signup.png'), Buffer.from(s.data, 'base64'));

  console.log('скриншоты:', SHOTS);
  cdp.close();
  console.log(failed ? '\nИТОГ: провалено ' + failed : '\nИТОГ: все проверки пройдены');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
