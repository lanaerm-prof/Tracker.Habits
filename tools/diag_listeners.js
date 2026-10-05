// Диагностика накопления обработчиков при повторных заходах на экран: node tools/diag_listeners.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { JSDOM, VirtualConsole } = (() => {
  const cands = ['jsdom', path.join(os.tmpdir(), 'opencode', 'uitest', 'node_modules', 'jsdom')];
  for (const c of cands) { try { return require(c); } catch (e) {} }
  throw new Error('jsdom not found');
})();

const URL = process.env.APP_URL || 'http://127.0.0.1:8123/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) console.error('PAGE ERROR:', e.message); });
  const dom = await JSDOM.fromURL(URL, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.scrollTo = () => {};
  await new Promise((r) => w.addEventListener('load', r));
  await sleep(200);
  const doc = w.document;
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const nav = async (h) => { w.location.hash = h; await sleep(150); };

  await w.Store.Auth.signUp('diag@mail.ru', '1234', 'Д');
  await nav('#/today');
  const id = w.Store.Habits.add({ name: 'Тест', frequency: 'daily', goal: 1 }).id;
  await nav('#/today');

  // ровно два захода на экран привычек: при накоплении обработчиков
  // два переключателя вернут состояние на место
  await nav('#/habits');
  await nav('#/stats');
  await nav('#/habits');

  const before = w.Store.Habits.get(id).archived;
  click(doc.querySelector('.habit-card [data-act="archive"]'));
  await sleep(80);
  const after = w.Store.Habits.get(id).archived;

  console.log('archived до:', before, '→ после одного клика:', after);
  console.log(after === !before ? 'OK: один клик = одно переключение' : 'BUG: обработчики накапливаются (кликнул, а состояние не изменилось)');
  process.exit(after === !before ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
