// Диагностика конкретных жалоб на десктопе:
//   1) клик по «галочке» на экране «Сегодня» — куда уезжает маршрут;
//   2) боковая панель: видна ли она после прокрутки страницы;
//   3) круг прогресса: меняется ли цвет заливки вместе с процентом.
// Запуск: node tools/diag_click.js  (нужен Chrome CDP на 9333 + сервер на 8123)
const http = require('http');

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9333';
const APP = process.env.APP_URL || 'http://127.0.0.1:8123/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
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
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
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

(async function main() {
  const page = await connect();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP });
  await sleep(1200);
  /* жёсткая перезагрузка: иначе Chrome может отдать app.js из HTTP-кеша */
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(1600);

  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description };
    return r.result && r.result.value;
  };

  const setup = await cdp.send('Runtime.evaluate', {
    expression: `(async function () {
      if (!Store.Auth.user()) {
        let r = await Store.Auth.signUp('demo@mail.ru', '1234', 'Аня');
        if (!r.ok) r = await Store.Auth.signIn('demo@mail.ru', '1234');
        if (!r.ok) return 'auth: ' + r.error;
      }
      if (Store.Habits.all().length === 0) {
        Store.Habits.add({ name: 'Выпить 8 стаканов воды', icon: 'water_drop', color: '#B83729', category: 'Здоровье', frequency: 'daily', goal: 8, unit: 'мл' });
        Store.Habits.add({ name: 'Читать 20 страниц', icon: 'menu_book', color: '#B83729', category: 'Учёба и работа', frequency: 'daily', goal: 20, unit: 'страниц' });
      }
      return 'ok';
    })()`,
    returnByValue: true, awaitPromise: true
  });
  console.log('setup:', JSON.stringify(setup.result && setup.result.value));

  /* программинговый вход не вызывает showApp() — показываем оболочку вручную */
  await ev(`document.getElementById('authScreen').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); window.app && window.app.refreshUserChip(); window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('hashchange'));`);

  /* ---- 1. клик по галочке ---- */
  /* сначала заходим в «Календарь» — так и воспроизводит пользователь */
  await ev(`location.hash = '#/calendar'`);
  await sleep(500);
  await ev(`location.hash = '#/today'`);
  await sleep(500);
  const before = await ev(`({ hash: location.hash, title: document.title, nav: (document.querySelector('.nav-link.is-active')||{}).textContent, view: (document.querySelector('#view h1')||{}).textContent })`);
  console.log('до клика :', JSON.stringify(before));

  /* настоящий клик мышью по центру «галочки» — с попаданием (hit-test) */
  async function realClick(sel) {
    await ev(`(function () { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.scrollIntoView({ block: 'center' }); })()`);
    await sleep(250);
    const box = await ev(`(function () { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null;
      const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; })()`);
    if (!box) { console.log('  нет элемента ' + sel); return; }
    const hit = await ev(`(function () { const el = document.elementFromPoint(${box.x}, ${box.y});
      return el ? { tag: el.tagName, cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className),
                    href: el.closest('a') ? el.closest('a').getAttribute('href') : null } : null; })()`);
    console.log('  под курсором: ' + JSON.stringify(hit));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }

  await realClick('#todayList .check');
  await sleep(600);
  const after = await ev(`({ hash: location.hash, title: document.title, nav: (document.querySelector('.nav-link.is-active')||{}).textContent, view: (document.querySelector('#view h1')||{}).textContent, hasCalendar: !!document.querySelector('.calendar-layout'), hasTodayList: !!document.querySelector('#todayList') })`);
  console.log('после    :', JSON.stringify(after));

  /* ---- 2. боковая панель при прокрутке ---- */
  await ev(`window.scrollTo(0, 900)`);
  await sleep(400);
  const side = await ev(`(function () {
    const s = document.querySelector('.sidebar');
    const r = s.getBoundingClientRect();
    const cs = getComputedStyle(s);
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
             pos: cs.position, cssH: cs.height, overflowX: getComputedStyle(document.body).overflowX,
             bodyH: document.body.scrollHeight, vh: window.innerHeight, scrollY: Math.round(window.scrollY) };
  })()`);
  console.log('sidebar  :', JSON.stringify(side));
  await ev(`window.scrollTo(0, 0)`);
  await sleep(300);

  /* ---- 3. круг прогресса: цвет заливки (ждём окончания transition) ---- */
  await ev(`(function () { const el = document.querySelector('.progress-ring'); if (el) el.style.setProperty('--p', '70'); })()`);
  await sleep(1300);
  const ring = await ev(`(function () {
    const el = document.querySelector('.progress-ring');
    if (!el) return 'no ring';
    const cs = getComputedStyle(el, '::before');
    return { hostP: getComputedStyle(el).getPropertyValue('--p').trim(),
             beforeP: cs.getPropertyValue('--p').trim(),
             mask: (cs.webkitMaskImage || cs.maskImage || '').slice(0, 120),
             size: Math.round(el.getBoundingClientRect().width) };
  })()`);
  console.log('ring     :', JSON.stringify(ring));

  /* снимаем пиксели самого кольца, чтобы точно судить про градиент */
  const ringBox = await ev(`(function () {
    const el = document.querySelector('.progress-ring');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, size: r.width,
             inset: parseFloat(getComputedStyle(el, '::after').inset) || 24 };
  })()`);
  console.log('ringBox  :', JSON.stringify(ringBox));

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = path.join(os.tmpdir(), 'opencode', 'shots');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'diag-today.png'), Buffer.from(shot.data, 'base64'));
  console.log('скриншот :', path.join(dir, 'diag-today.png'));

  if (ringBox && ringBox.cx > 0) {
    const sampled = await ev(`(async function () {
      const img = new Image();
      img.src = 'data:image/png;base64,${shot.data}';
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const cx = ${ringBox.cx}, cy = ${ringBox.cy};
      const R = ${ringBox.size} / 2 - ${ringBox.inset} / 2;
      const out = [];
      for (let a = 0; a < 360; a += 30) {
        const rad = (a - 90) * Math.PI / 180;
        const x = Math.round(cx + Math.cos(rad) * R);
        const y = Math.round(cy + Math.sin(rad) * R);
        const d = g.getImageData(x, y, 1, 1).data;
        out.push(a + ' rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')');
      }
      return out;
    })()`);
    console.log('пиксели кольца (0 = верх, по часовой):');
    (Array.isArray(sampled) ? sampled : [sampled]).forEach((s) => console.log('   ', s));
  }

  cdp.ws.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
