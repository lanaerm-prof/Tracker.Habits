// Скриншот экрана приложения через headless Chrome (CDP 9333).
//   node tools/shot.js "#/habits" habits  [ширина] [высота]
// Аргументы: хеш маршрута, имя файла (без .png), необязательно ширина и высота.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9333';
const APP = process.env.APP_URL || 'http://127.0.0.1:8123/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hash = process.argv[2] || '#/today';
const name = process.argv[3] || 'shot';
const width = parseInt(process.argv[4], 10) || 1920;
const height = parseInt(process.argv[5], 10) || 1080;

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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP });
  await sleep(1000);
  /* жёсткая перезагрузка: иначе Chrome может отдать app.js из HTTP-кеша */
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(1600);

  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description };
    return r.result && r.result.value;
  };

  /* демо-данные: несколько привычек в разных категориях, чтобы галереи были наполнены */
  const setup = await cdp.send('Runtime.evaluate', {
    expression: `(async function () {
      if (!Store.Auth.user()) {
        let r = await Store.Auth.signUp('demo@mail.ru', '1234', 'Аня');
        if (!r.ok) r = await Store.Auth.signIn('demo@mail.ru', '1234');
        if (!r.ok) return 'auth: ' + r.error;
      }
      if (Store.Habits.all().length < 6) {
        const mk = (o) => Store.Habits.add(Object.assign({ frequency: 'daily', goal: 1, unit: 'раз' }, o));
        mk({ name: 'Выпить 8 стаканов воды', icon: 'water_drop', color: '#8FB8B2', category: 'Здоровье', goal: 8, unit: 'мл' });
        mk({ name: 'Читать 20 страниц', icon: 'menu_book', color: '#B83729', category: 'Учёба и работа', goal: 20, unit: 'страниц' });
        mk({ name: 'Прогулка 30 минут', icon: 'directions_walk', color: '#8FB8B2', category: 'Здоровье', goal: 30, unit: 'минут' });
        mk({ name: 'Тренировка', icon: 'fitness_center', color: '#B83729', category: 'Спорт и движение', goal: 1, unit: 'раз' });
        mk({ name: 'Не есть сладкое', icon: 'candy', color: '#8FB8B2', category: 'Питание' });
        mk({ name: 'Медитация 10 минут', icon: 'self_improvement', color: '#B83729', category: 'Здоровье', goal: 10, unit: 'минут' });
        mk({ name: 'Убрать рабочий стол', icon: 'cleaning_services', color: '#8FB8B2', category: 'Дом и быт' });
        mk({ name: 'Сон до 23:00', icon: 'bedtime', color: '#B83729', category: 'Здоровье' });
      }
      return 'ok';
    })()`,
    returnByValue: true, awaitPromise: true
  });
  console.log('setup:', JSON.stringify(setup.result && setup.result.value));

  /* программный вход не вызывает showApp() — показываем оболочку вручную */
  await ev(`document.getElementById('authScreen').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); window.app && window.app.refreshUserChip();`);
  console.log('chip после показа:', JSON.stringify(await ev(`({
    hasApp: !!window.app,
    user: Store.Auth.user(),
    chip: document.getElementById('userName').textContent,
    mail: document.getElementById('userMail').textContent
  })`)));

  await ev(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(900);
  await ev(`window.dispatchEvent(new Event('resize')); location.hash = ''; location.hash = ${JSON.stringify(hash)}`);
  await sleep(900);
  await ev(`window.scrollTo(0, 0)`);

  const info = await ev(`({
    hash: location.hash,
    title: (document.querySelector('#view h1') || {}).textContent,
    chip: document.getElementById('userName').textContent,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    bodyH: document.body.scrollHeight,
    vh: window.innerHeight
  })`);
  console.log('экран:', JSON.stringify(info));

  const dir = path.join(os.tmpdir(), 'opencode', 'shots');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name + '.png');
  /* снимаем всю страницу целиком, а не только видимую часть */
  const metrics = await cdp.send('Page.getLayoutMetrics');
  const size = metrics.cssContentSize || metrics.contentSize;
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 }
  });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  const after = await ev(`({ chip: document.getElementById('userName').textContent, mail: document.getElementById('userMail').textContent, href: location.href })`);
  console.log('после снимка :', JSON.stringify(after));
  console.log('скриншот :', file, `(${Math.ceil(size.width)}x${Math.ceil(size.height)})`);

  cdp.ws.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
