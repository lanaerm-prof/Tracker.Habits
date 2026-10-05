// Быстрый замер в живой странице: node tools/probe.js "#/categories" "JS-выражение"
const http = require('http');
const fs = require('fs');

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9333';
const APP = process.env.APP_URL || 'http://127.0.0.1:8123/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hash = process.argv[2] || '#/today';
let expr = process.argv[3] || '1';
/* выражение можно передать файлом: node tools/probe.js "#/x" @путь\к\файлу.js */
if (expr.charAt(0) === '@') expr = fs.readFileSync(expr.slice(1), 'utf8');
const VW = parseInt(process.argv[4], 10) || 1920;
const VH = parseInt(process.argv[5], 10) || 1080;

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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP });
  await sleep(900);
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(1500);

  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description };
    return r.result && r.result.value;
  };

  await ev(`(async function () {
    if (!Store.Auth.user()) { let r = await Store.Auth.signUp('demo@mail.ru', '1234', 'Аня'); if (!r.ok) await Store.Auth.signIn('demo@mail.ru', '1234'); }
    if (Store.Habits.all().length < 6) {
      const mk = (o) => Store.Habits.add(Object.assign({ frequency: 'daily', goal: 1, unit: 'раз' }, o));
      mk({ name: 'Выпить 8 стаканов воды', icon: 'water_drop', color: '#8FB8B2', category: 'Здоровье', goal: 8, unit: 'мл' });
      mk({ name: 'Читать 20 страниц', icon: 'menu_book', color: '#B83729', category: 'Учёба и работа', goal: 20, unit: 'страниц' });
      mk({ name: 'Прогулка 30 минут', icon: 'directions_walk', color: '#8FB8B2', category: 'Здоровье', goal: 30, unit: 'минут' });
      mk({ name: 'Тренировка', icon: 'fitness_center', color: '#B83729', category: 'Спорт и движение' });
      mk({ name: 'Не есть сладкое', icon: 'candy', color: '#8FB8B2', category: 'Питание' });
      mk({ name: 'Медитация 10 минут', icon: 'self_improvement', color: '#B83729', category: 'Здоровье', goal: 10, unit: 'минут' });
    }
    return 'ok';
  })()`);
  await ev(`document.getElementById('authScreen').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); window.app && window.app.refreshUserChip();`);
  await ev(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(900);

  /* выражение может быть и обычным, и async — тогда ждём его результата */
  const out = await ev(`(async function () { try { return JSON.stringify(await (${expr})); } catch (e) { return 'ERR: ' + (e && e.message ? e.message : e); } })()`);
  console.log(typeof out === 'string' ? out : JSON.stringify(out));
  cdp.ws.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
