// Проверка: все ли значки из интерфейса есть в icons.js и непустые
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const iconsSrc = fs.readFileSync(path.join(root, 'js', 'icons.js'), 'utf8');

// ключи: name: '...' в словаре ICONS
const keys = {};
const re = /([a-z0-9_]+)\s*:\s*'([^']*)'/g;
let m;
while ((m = re.exec(iconsSrc))) keys[m[1]] = m[2];
console.log('иконок в icons.js:', Object.keys(keys).length);

// где в коде запрашиваются значки
const used = new Set();
for (const f of ['views.js', 'ui.js', 'store.js', 'app.js', 'index.html']) {
  const p = path.join(root, f.endsWith('.html') ? f : 'js', f);
  if (!fs.existsSync(p)) continue;
  const s = fs.readFileSync(p, 'utf8');
  const r1 = /UI\.icon\('([a-z0-9_]+)'\)/g;
  let x;
  while ((x = r1.exec(s))) used.add(x[1]);
  const r2 = /data-icon="([a-z0-9_]+)"/g;
  while ((x = r2.exec(s))) used.add(x[1]);
  const r3 = /icon:\s*'([a-z0-9_]+)'/g;
  while ((x = r3.exec(s))) used.add(x[1]);
}

const miss = [];
const empty = [];
for (const n of [...used].sort()) {
  if (!(n in keys)) miss.push(n);
  else if (!keys[n].trim()) empty.push(n);
}
console.log('используется значков:', used.size);
console.log('НЕТ в icons.js:', miss.length ? miss.join(', ') : '—');
console.log('ПУСТОЙ путь:', empty.length ? empty.join(', ') : '—');

// список ключей для ручной сверки
console.log('--- ключи ---');
console.log(Object.keys(keys).sort().join(', '));
