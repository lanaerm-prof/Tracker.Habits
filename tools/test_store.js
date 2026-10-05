// Логический тест слоя данных (без DOM): node tools/test_store.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};

const sandbox = { console, localStorage, crypto: webcrypto, TextEncoder, Date, Math, JSON, Object, Array, parseInt, setTimeout };
sandbox.window = sandbox;
vm.createContext(sandbox);

const root = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'store.js'), 'utf8'), sandbox, { filename: 'store.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'icons.js'), 'utf8'), sandbox, { filename: 'icons.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'ui.js'), 'utf8'), sandbox, { filename: 'ui.js' });

const test = `
(async function () {
  let failed = 0;
  function ok(cond, msg) {
    if (cond) console.log('  ok  -', msg);
    else { failed++; console.log('  FAIL-', msg); }
  }
  const D = Store.dates, H = Store.Habits, S = Store.stats;
  const ymd = D.ymd;
  const ago = (n) => ymd(D.addDays(new Date(), -n));
  const WEEK = [1, 3, 5];

  console.log('1. Авторизация');
  let r = await Store.Auth.signUp('user@mail.ru', '1234', 'Аня');
  ok(r.ok, 'регистрация проходит');
  r = await Store.Auth.signUp('user@mail.ru', '1234', 'Аня');
  ok(!r.ok, 'повторная регистрация отклоняется');
  r = await Store.Auth.signIn('user@mail.ru', '9999');
  ok(!r.ok, 'неверный пароль отклоняется');
  r = await Store.Auth.signIn('user@mail.ru', '1234');
  ok(r.ok, 'вход по паролю работает');

  const uid = Store.Auth.users()[0].id;
  Store.Auth.signOut();
  localStorage.setItem('ht:session:v1', JSON.stringify(uid));
  ok(Store.Auth.restore() !== null, 'сессия восстанавливается после перезагрузки');
  ok(Store.Auth.user().email === 'user@mail.ru', 'пользователь тот же');

  console.log('2. Создание привычек');
  const a = H.add({ name: 'Выпить воды', frequency: 'daily', goal: 1, category: 'Здоровье', icon: '💧', color: '#0ea5e9' });
  a.createdAt = Date.now() - 20 * 86400000;
  const b = H.add({ name: 'Тренировка', frequency: 'weekly', days: [1, 3, 5], goal: 3, unit: 'подходов' });
  b.createdAt = Date.now() - 20 * 86400000;
  const c = H.add({ name: 'Чтение', frequency: 'weekly', days: [] });
  c.createdAt = Date.now() - 20 * 86400000;
  ok(H.all().length === 3, 'создано 3 привычки');
  ok(H.get(c.id).days.length === 3, 'недельная без дней получает дни по умолчанию');
  ok(H.get(c.id).goal === 1, 'цель по умолчанию = 1');

  console.log('3. Расписание');
  ok(H.isDue(a, ymd(new Date())), 'ежедневная привычка активна сегодня');
  ok(H.isDue(b, ymd(new Date())) === WEEK.includes(new Date().getDay()), 'недельная активна только в свои дни');
  ok(!H.isDue(a, ago(25)), 'привычка не активна раньше даты создания');

  console.log('4. Отметки и серия');
  for (let i = 1; i <= 6; i++) H.setCount(a.id, ago(i), 1);
  ok(H.isDone(a, ago(3)), 'отметка за прошлую дату видна');
  ok(!H.isDone(a, ymd(new Date())), 'сегодня ещё не отмечено');
  ok(S.habitStreak(a) === 6, 'текущая серия = 6, сейчас ' + S.habitStreak(a));
  ok(S.habitBest(a) === 6, 'лучшая серия = 6, сейчас ' + S.habitBest(a));
  H.toggle(a.id, ymd(new Date()));
  ok(H.isDone(a, ymd(new Date())), 'toggle отмечает сегодня');
  ok(S.habitStreak(a) === 7, 'серия выросла до 7, сейчас ' + S.habitStreak(a));
  H.toggle(a.id, ymd(new Date()));
  ok(!H.isDone(a, ymd(new Date())), 'повторный toggle снимает отметку');

  console.log('5. Цели с несколькими единицами');
  H.setCount(b.id, ago(1), 2);
  ok(H.countFor(ago(1), b.id) === 2, 'частичный прогресс сохранён');
  H.setCount(b.id, ago(1), 99);
  ok(H.countFor(ago(1), b.id) === 3, 'значение ограничено целью');
  ok(H.isDone(b, ago(1)), 'выполнение цели засчитывается');

  console.log('6. Статистика');
  const r7 = S.rangeStat(7);
  ok(r7.due >= 7, 'за 7 дней запланировано не меньше 7 отметок: ' + r7.due);
  ok(r7.done >= 6, 'выполнено не меньше 6: ' + r7.done);
  ok(r7.percent > 0 && r7.percent <= 100, 'процент корректен: ' + r7.percent);
  const chart = S.chart(30);
  ok(chart.length === 30, 'график содержит 30 дней');
  ok(chart[chart.length - 1].date === ymd(new Date()), 'последняя точка графика — сегодня');
  ok(S.overallStreak() >= 6, 'общая серия >= 6: ' + S.overallStreak());
  ok(S.overallBest() >= S.overallStreak(), 'лучшая серия >= текущей');
  ok(S.ranking(5).length === 3, 'рейтинг по всем активным привычкам');

  console.log('7. Календарь / изменение прошлых дат');
  H.toggle(a.id, ago(10));
  ok(H.isDone(a, ago(10)), 'отметка 10-дневной давности работает');
  H.toggle(a.id, ago(10));
  ok(!H.isDone(a, ago(10)), 'снятие отметки 10-дневной давности работает');

  console.log('8. Архив и удаление');
  H.setArchived(b.id, true);
  ok(H.archived().length === 1, 'привычка в архиве');
  ok(!H.isDue(b, ymd(new Date())), 'архивная привычка не попадает в «Сегодня»');
  ok(H.isActiveOn(b, ago(1)), 'история архивной привычки сохраняется');
  H.setArchived(b.id, false);
  ok(H.active().length === 3, 'возврат из архива работает');

  const before = S.rangeStat(7).due;
  H.remove(a.id);
  ok(H.get(a.id) === null, 'удаление привычки');
  ok(!Object.values(Store.exportPayload().logs).some((d) => d[a.id]), 'история удалённой привычки очищена');
  ok(S.rangeStat(7).due < before, 'статистика пересчиталась после удаления');

  console.log('9. Настройки, экспорт, удаление данных');
  Store.Settings.set({ theme: 'dark', name: 'Аня' });
  ok(Store.Settings.get().theme === 'dark', 'тема сохраняется');
  Store.Settings.set({ theme: 'system' });
  ok(Store.Settings.get().theme === 'light', 'старое значение «система» заменяется на светлую');
  Store.Settings.set({ theme: 'dark' });
  Store.Auth.updateProfile('Анечка');
  ok(Store.Settings.get().name === 'Анечка', 'имя сохраняется');
  const payload = Store.exportPayload();
  ok(payload.habits.length === 2 && payload.user.email === 'user@mail.ru', 'экспорт содержит данные');
  Store.wipe();
  ok(H.all().length === 0 && Store.Settings.get().theme === 'light', 'удаление данных очищает всё');

  console.log('10. Категории, пропуски, переводы величин, периоды');
  ok(Store.Categories.all().length > 0, 'после удаления данных категории пересоздаются: ' + Store.Categories.all().length);
  ok(Store.Categories.add('Хобби') === true, 'новая категория добавлена');
  ok(Store.Categories.add('Хобби') === false, 'дубликат категории отклонён');
  ok(Store.Categories.count('Хобби') === 0, 'у новой категории нет привычек');
  ok(Store.Categories.rename('Хобби', 'Хобби2') === true, 'переименование работает');
  ok(Store.Categories.all().indexOf('Хобби2') !== -1, 'новое имя на месте');
  ok(Store.Categories.rename('Здоровье', 'Питание') === false, 'переименование в существующее имя отклонено');
  Store.Categories.remove('Хобби2');
  ok(Store.Categories.all().indexOf('Хобби2') === -1, 'категория удалена');

  const mh = H.add({ name: 'Вода', frequency: 'daily', missLimit: 2 });
  let ms = Store.missStats(mh, D.today());
  ok(ms.limit === 2 && ms.remaining === 2, 'лимит пропусков сохранён: ' + JSON.stringify(ms));
  ok(ms.exceeded === false, 'пропусков пока нет');
  const mfree = H.add({ name: 'Без лимита', frequency: 'daily', missLimit: 0 });
  ms = Store.missStats(mfree, D.today());
  ok(ms.limit === 0 && ms.remaining === -1, 'missLimit = 0 означает «без лимита»');

  ok(UI.humanize(320, 'страниц') === '2 книги', '320 страниц ≈ 2 книги: ' + UI.humanize(320, 'страниц'));
  ok(UI.humanize(500, 'мин') === 'более 8 часов', '500 минут ≈ более 8 часов: ' + UI.humanize(500, 'мин'));
  ok(UI.humanize(120, 'мин') === '2 часа', '120 минут = 2 часа: ' + UI.humanize(120, 'мин'));
  ok(UI.humanize(50, 'мин') === '', '45 минут — перевод не нужен');
  ok(UI.humanize(3000, 'мл') === '3 литра', '3000 мл = 3 литра: ' + UI.humanize(3000, 'мл'));
  ok(UI.humanize(40, 'мл') === '', '40 мл — перевод не нужен');
  ok(UI.humanize(3000, 'шагов') === '2.3 километра', '3000 шагов ≈ 2.3 км: ' + UI.humanize(3000, 'шагов'));
  ok(UI.plural(1, 'день', 'дня', 'дней') === 'день' && UI.plural(3, 'день', 'дня', 'дней') === 'дня' && UI.plural(5, 'день', 'дня', 'дней') === 'дней', 'склонения дней');

  const p7 = S.periodStat(7);
  ok(p7.from < p7.to && p7.due > 0, 'periodStat(7) считает запланированные отметки: ' + JSON.stringify(p7));
  const pAll = S.periodStat('all');
  ok(pAll.from === S.historyStart() && pAll.to === D.today(), 'periodStat("all") охватывает всю историю: ' + pAll.from + '…' + pAll.to);
  ok(pAll.from <= p7.to, 'период «всё время» не начинается позже конца недели');
  ok(S.chartDaily(7).length === 7, 'chartDaily(7) отдаёт 7 точек');
  ok(S.chartWeekly(14).length > 0, 'chartWeekly(14) отдаёт недели: ' + S.chartWeekly(14).length);
  ok(Array.isArray(S.periodBuckets(30, 'week')) && S.periodBuckets(30, 'month').length > 0, 'ведра по неделям и месяцам');
  ok(Array.isArray(S.categoryActivity(30)), 'активность по категориям отдаёт массив');
  const ut = S.unitTotals(30);
  ok(Array.isArray(ut) && ut.every((x) => typeof x.total === 'number'), 'unitTotals по числовым целям');
  ok(S.historyStart() !== null, 'historyStart определён: ' + S.historyStart());

  const payload2 = Store.exportPayload();
  ok(payload2.categories.length > 0 && payload2.missLimit === undefined, 'экспорт содержит категории');
  Store.wipe();

  console.log(failed ? ('\\nИТОГ: провалено ' + failed) : '\\nИТОГ: все проверки пройдены');
  if (failed) throw new Error('tests failed: ' + failed);
})();
`;

vm.runInContext(test, sandbox, { filename: 'test.js' }).catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
